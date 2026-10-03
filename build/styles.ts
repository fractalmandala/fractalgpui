/**
 * The one place styles are built and handed to GPUI:
 *
 *   fractalstyler src  ─┐                     ┌→ ClassRule[] → define_styles (pruned to used classes)
 *                       ├→ tokens.ts (flatten)├→ design.tokens (light/dark) → set_css_vars
 *   src/styles (_own)  ─┘   gpui-css.ts ──────┴→ losses (the strict check reads these)
 *
 * Components carry plain `class="…"` and no `<style>` block (fractalstyler's
 * closed world). App-only classes live in `src/styles/_own.sass`.
 */

import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import type { ClassRule } from 'gpuix-svelte';
import { define_styles } from 'gpuix-svelte/renderer';
import { design } from '../src/kernel/design.svelte.ts';
import { allowed, ALLOWED, type Allowance } from './allow.ts';
import { compile_fractalstyler, type FractalstylerBuild } from './fractalstyler.ts';
import { sort_rules, translate_css, type Loss } from './gpui-css.ts';
import { collect_tokens, empty_raw, flatten, type TokenSets } from './tokens.ts';
import { selector_tags, used_classes, used_tags } from './used-classes.ts';

export const APP_SRC = fileURLToPath(new URL('../src/', import.meta.url));
export const APP_STYLES = fileURLToPath(new URL('../src/styles/index.sass', import.meta.url));

export interface StyleBuild {
	fractalstyler: FractalstylerBuild;
	tokens: TokenSets;
	rules: ClassRule[];
	losses: Loss[];
	/** Every class defined by fractalstyler or the app (intact or not). */
	defined: Set<string>;
	/** class → files using it. */
	used: Map<string, string[]>;
	/** Element names the app renders. */
	tags: Set<string>;
	/** Rules actually registered with GPUI after pruning. */
	registered: number;
	warnings: string[];
}

export interface BuildOptions {
	/** Register only rules whose classes all appear in the app's components. Default true. */
	prune?: boolean;
	fractalstylerDir?: string;
	appStyles?: string;
	appSrc?: string;
}

const OWN = 'app/src/styles';

export function build_styles({ prune = true, fractalstylerDir, appStyles = APP_STYLES, appSrc = APP_SRC }: BuildOptions = {}): StyleBuild {
	const fs = compile_fractalstyler(fractalstylerDir);
	const own_css = compile(appStyles, { style: 'expanded', charset: false }).css;

	// Tokens first: fractalstyler's, then the app's additions (later wins).
	const raw = empty_raw();
	for (const sheet of fs.sheets) collect_tokens(sheet.css, raw);
	collect_tokens(own_css, raw);
	const tokens = flatten(raw);

	const rules: ClassRule[] = [];
	const losses: Loss[] = [];
	const defined = new Set<string>();
	for (const sheet of [...fs.sheets, { source: OWN, css: own_css }]) {
		const t = translate_css(sheet.css, { source: sheet.source, tokens });
		rules.push(...t.rules);
		losses.push(...t.losses);
		for (const c of t.defined) defined.add(c);
	}

	const used = used_classes(appSrc);
	const tags = used_tags(appSrc);
	const sorted = sort_rules(rules);
	const kept = prune ? sorted.filter((r) => r.classes.every((c) => used.has(c))) : sorted;

	return { fractalstyler: fs, tokens, rules: kept, losses, defined, used, tags, registered: kept.length, warnings: [...fs.warnings] };
}

let registered = new Set<string>();

/**
 * The renderer visits one sheet per class name on an element and concatenates what
 * matches, in element-class order. Registering the *whole* sorted list under every
 * class name means the last visit is always a complete, correctly ordered pass,
 * whatever order `class="…"` lists its names in. Pruning to used classes keeps that
 * list short.
 */
function register(rules: ClassRule[]) {
	const keys = new Set(rules.flatMap((rule) => rule.classes));
	for (const key of registered) if (!keys.has(key)) define_styles(key, []);
	for (const key of keys) define_styles(key, rules);
	registered = keys;
}

let last: StyleBuild | null = null;
export const last_build = () => last;

/** Build and register. Throws on an app Sass error, leaving earlier styles in force. */
export function load_styles(options: BuildOptions = {}): StyleBuild {
	const build = build_styles(options);
	register(build.rules);
	design.tokens = { light: build.tokens.light, dark: build.tokens.dark };
	design.report = { mode: build.fractalstyler.mode, registered: build.registered, losses: build.losses.length, warnings: build.warnings };
	for (const w of build.warnings) console.warn(`[fractalgpui] ${w}`);
	last = build;
	return build;
}

/**
 * What the strict check fails on: unknown classes, and losses that touch classes the
 * app uses (every class in the lost selector is used, and every element name in it is
 * one the app renders, so `a.primary` is moot for an app without <a>) unless allowed
 * in `allow.ts`; any loss at all in the app's own stylesheet.
 */
export function style_problems(build: StyleBuild, allow: Allowance[] = ALLOWED): string[] {
	const problems: string[] = [];
	const short = (f: string) => f.slice(f.indexOf('/src/') + 1);

	for (const [c, files] of build.used) {
		if (!build.defined.has(c)) problems.push(`unknown class .${c} (used in ${files.map(short).join(', ')})`);
	}
	for (const loss of build.losses) {
		const own = loss.source === OWN;
		const relevant =
			own ||
			(loss.classes.length > 0 && loss.classes.every((c) => build.used.has(c)) && selector_tags(loss.selector).every((t) => build.tags.has(t)));
		if (!relevant || (!own && allowed(loss, allow))) continue;
		problems.push(`${loss.source}: ${loss.selector} → ${loss.detail}: ${loss.reason}`);
	}
	return problems;
}
