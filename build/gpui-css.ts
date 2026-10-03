/**
 * Compiled CSS → GPUI class rules, with an honest ledger of everything lost.
 *
 * GPUI has no CSS engine; gpuix-svelte takes class rules made of classes (plus at
 * most one tag) and `:hover`/`:active`, with a narrow set of properties and values.
 * This pass keeps fractalstyler's class names and rewrites what has a GPUI
 * equivalent:
 *
 *   background: X                → background-color: X        (colours only)
 *   border(-side): 1px solid C   → border(-side)-width + border-color
 *   flex: 1 1 0%                 → flex-grow / flex-shrink / flex-basis
 *   padding|margin-inline|block  → the physical sides (LTR)
 *   overflow: auto               → scroll
 *   grid-template-*: repeat(N,…) → N (GPUI takes a track count)
 *   line-height: 1.5             → px, when the same rule sets font-size
 *   var(--invariant-token)       → inlined + calc/rem reduced to px
 *
 * Everything else that cannot reach GPUI — `@media`, `@keyframes`, descendant and
 * attribute selectors, `:focus-visible`, `box-shadow`, `transition`, `transform`,
 * `letter-spacing`, viewport units… — is skipped and recorded as a `Loss`, so a
 * strict check can fail on the ones that touch classes the app actually uses.
 * Theme-dependent `var()`s stay runtime variables (set_css_vars) and are validated
 * against both modes.
 */

import { parse, type Declaration, type Node } from '../src/tools/css-to-sass/lib/index.ts';
import type { ClassRule } from 'gpuix-svelte';
import { parse_css_text } from 'gpuix-svelte';
import { irreducible, reduce, substitute, token_block, type TokenSets } from './tokens.ts';

export interface Loss {
	/** The selector (or at-rule prelude + selector) the loss belongs to. */
	selector: string;
	/** Class names appearing in that selector: a loss matters when the app uses them all. */
	classes: string[];
	kind: 'selector' | 'at-rule' | 'declaration';
	/** The declaration or construct that was dropped. */
	detail: string;
	reason: string;
	/** Which stylesheet it came from (a partial name, or the app's own). */
	source: string;
}

export interface Translation {
	rules: ClassRule[];
	losses: Loss[];
	/** Every class name a rule defines (whether or not it reached GPUI intact). */
	defined: Set<string>;
}

// --- selectors ----------------------------------------------------------------

const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g;
const GPUI_SELECTOR = /^([a-zA-Z][\w-]*)?((?:\.-?[_a-zA-Z][\w-]*)+)(?::(hover|active))?$/;

const classes_in = (selector: string) => [...selector.matchAll(CLASS)].map((m) => m[1]);

function selector_shape(selector: string): { classes: string[]; tag: string | null; pseudo: 'hover' | 'active' | null } | string {
	const m = GPUI_SELECTOR.exec(selector.trim());
	if (m) return { classes: classes_in(m[2]), tag: m[1] ?? null, pseudo: (m[3] as 'hover' | 'active' | undefined) ?? null };
	if (/[\s>+~]/.test(selector.trim())) return 'descendant/child/sibling combinators have no GPUI equivalent';
	if (selector.includes('[')) return 'attribute selectors have no GPUI equivalent';
	if (/::?[\w-]+/.test(selector) && !/:(hover|active)$/.test(selector)) {
		return `\`${/::?[\w-]+(\(.*?\))?/.exec(selector)![0]}\` has no GPUI equivalent (only :hover / :active)`;
	}
	if (!selector.includes('.')) return 'tag-only selectors cannot match: GPUI rules are found through class names';
	return 'unsupported selector';
}

// --- values -------------------------------------------------------------------

const PX_OR_NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/;
const PERCENT = /^-?(?:\d+\.?\d*|\.\d+)%$/;
const NUM = /^-?(?:\d+\.?\d*|\.\d+)$/;
const COLOR = /^(#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(.*\)|[a-z]+)$/i;
const NOT_COLORS = new Set(['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'none', 'auto']);

/** Splits on top-level whitespace (parens respected). */
function words(value: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of value) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (depth === 0 && /\s/.test(ch)) {
			if (cur) out.push(cur);
			cur = '';
		} else cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

const is_color = (v: string) => COLOR.test(v) && !NOT_COLORS.has(v.toLowerCase());
const is_var = (v: string) => /^var\(.*\)$/.test(v);

const LENGTH_KEYS = new Set([
	'flex-basis', 'gap', 'row-gap', 'column-gap',
	'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
	'top', 'right', 'bottom', 'left', 'inset',
	'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
	'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
	'font-size', 'line-height'
]);
/** Box shorthands gpuix expands from 1-4 values. */
const MULTI = new Set(['padding', 'margin', 'border-width', 'border-radius', 'inset', 'gap']);
const DIMENSION_KEYS = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height']);
const COLOR_KEYS = new Set(['color', 'background-color', 'border-color', 'selection-color']);
const NUMBER_KEYS = new Set(['flex-grow', 'flex-shrink', 'opacity', 'line-clamp']);

const KEYWORDS: Record<string, Set<string>> = {
	display: new Set(['flex', 'grid']),
	'flex-direction': new Set(['row', 'column']),
	'flex-wrap': new Set(['wrap', 'wrap-reverse', 'nowrap']),
	'align-items': new Set(['center', 'start', 'end', 'flex-start', 'flex-end']),
	'align-self': new Set(['center', 'start', 'end', 'flex-start', 'flex-end', 'stretch', 'baseline']),
	'align-content': new Set(['center', 'start', 'end', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'stretch', 'normal']),
	'justify-content': new Set(['center', 'start', 'end', 'flex-start', 'flex-end', 'space-between', 'space-around', 'between', 'around']),
	position: new Set(['relative', 'absolute', 'fixed']),
	overflow: new Set(['hidden', 'scroll']),
	'overflow-x': new Set(['hidden', 'scroll']),
	'overflow-y': new Set(['hidden', 'scroll']),
	'text-align': new Set(['left', 'center', 'right', 'start']),
	'white-space': new Set(['nowrap', 'normal']),
	'text-overflow': new Set(['ellipsis', 'ellipsis-start']),
	'pointer-events': new Set(['none', 'auto']),
	'user-select': new Set(['none']),
	cursor: new Set(['pointer', 'text', 'grab', 'grabbing', 'move', 'crosshair', 'not-allowed', 'copy', 'alias', 'context-menu', 'default',
		'col-resize', 'row-resize', 'n-resize', 's-resize', 'e-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize']),
	'font-weight': new Set(['normal', 'bold', 'thin', 'extralight', 'light', 'medium', 'semibold', 'extrabold', 'black'])
};

/** Dropped without counting as a loss: GPUI's behaviour already matches. */
const BENIGN: Record<string, ((v: string) => boolean) | true> = {
	'box-sizing': (v) => v === 'border-box',
	display: (v) => v === 'block',
	'text-decoration': (v) => v === 'none',
	'list-style': true,
	'list-style-type': (v) => v === 'none',
	appearance: (v) => v === 'none',
	'-webkit-appearance': (v) => v === 'none',
	outline: (v) => v === 'none' || v === '0',
	overflow: (v) => v === 'visible',
	'color-scheme': true,
	'font-optical-sizing': true,
	'-webkit-font-smoothing': true,
	'will-change': true
};

const WHY: Record<string, string> = {
	'box-shadow': 'GPUI has no box-shadow from CSS text',
	transition: 'GPUI has no CSS transitions (gpuix animates through the `motion` prop)',
	animation: 'GPUI has no CSS animations',
	transform: 'GPUI ignores transform',
	'letter-spacing': 'GPUI ignores letter-spacing',
	'z-index': 'GPUI paints in document order (use <Portal>)',
	'text-transform': 'GPUI has no text-transform',
	'text-decoration': 'GPUI ignores text-decoration',
	'aspect-ratio': 'GPUI has no aspect-ratio',
	'grid-column': 'GPUI grids take a track count only; no spans',
	'place-items': 'GPUI has no place-items',
	'justify-items': 'GPUI has no justify-items',
	'scroll-snap-type': 'GPUI has no scroll snapping',
	'scroll-snap-align': 'GPUI has no scroll snapping',
	'overscroll-behavior': 'GPUI has no overscroll-behavior',
	'overscroll-behavior-inline': 'GPUI has no overscroll-behavior',
	visibility: 'GPUI ignores visibility (use {#if})',
	'object-fit': 'GPUI has no object-fit',
	perspective: 'GPUI has no 3D transforms',
	'background-image': 'GPUI backgrounds are solid colours from CSS text',
	'background-repeat': 'GPUI backgrounds are solid colours from CSS text',
	'background-position': 'GPUI backgrounds are solid colours from CSS text',
	font: 'the font shorthand has no GPUI field',
	'border-style': 'GPUI borders are solid',
	outline: 'GPUI has no outline'
};

type Out = { decls: [string, string][]; loss?: string };

const drop = (reason: string): Out => ({ decls: [], loss: reason });
const keep = (prop: string, value: string): Out => ({ decls: [[prop, value]] });

/** Is a single, fully reduced value acceptable for `prop`? Returns the reason when not. */
export function gpui_value_problem(prop: string, value: string): string | null {
	const v = value.trim();
	if (v === '') return 'empty value';
	if (irreducible(v)) return `\`${v}\`: GPUI only takes px (no rem/calc/viewport units)`;
	if (LENGTH_KEYS.has(prop)) {
		const parts = MULTI.has(prop) ? words(v) : [v];
		if (parts.length > (prop === 'gap' ? 2 : 4)) return `\`${v}\`: too many values`;
		for (const p of parts) {
			if (!PX_OR_NUM.test(p)) return `\`${p}\`: ${prop} takes px only${p === 'auto' ? ' (no auto margins)' : ''}`;
		}
		return null;
	}
	if (DIMENSION_KEYS.has(prop)) return PX_OR_NUM.test(v) || PERCENT.test(v) || v === 'auto' ? null : `\`${v}\`: ${prop} takes px, % or auto`;
	if (COLOR_KEYS.has(prop)) return is_color(v) ? null : `\`${v}\` is not a colour GPUI can parse`;
	if (NUMBER_KEYS.has(prop)) return NUM.test(v) ? null : `\`${v}\`: ${prop} takes a number`;
	if (prop === 'font-weight') return KEYWORDS[prop].has(v) || (NUM.test(v) && +v >= 1 && +v <= 1000) ? null : `\`${v}\`: unsupported font-weight`;
	if (prop === 'grid-template-columns' || prop === 'grid-template-rows') return /^\d+$/.test(v) ? null : `\`${v}\`: GPUI takes a track count`;
	if (prop === 'font-family') return v && !NOT_COLORS.has(v) ? null : `\`${v}\`: not a font family`;
	const kw = KEYWORDS[prop];
	if (kw) return kw.has(v) ? null : `\`${v}\` is not one of GPUI's ${prop} values`;
	return `\`${prop}\` has no GPUI equivalent`;
}

function first_family(v: string): string {
	return v.split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/** One CSS declaration → GPUI longhands (still possibly holding runtime `var()`s). */
function rewrite(prop: string, value: string, rule_font_px: number | null): Out {
	const v = value.trim();
	const benign = BENIGN[prop];
	if (benign === true || (benign && benign(v))) return { decls: [] };

	switch (prop) {
		case 'align-items':
		case 'align-self':
		case 'align-content':
		case 'justify-content':
			// gpuix documents `start`/`end`; normalise the flex- forms.
			return keep(prop, v === 'flex-start' ? 'start' : v === 'flex-end' ? 'end' : v);
		case 'background':
			return is_color(v) || is_var(v) ? keep('background-color', v) : drop('only solid-colour backgrounds reach GPUI');
		case 'border':
		case 'border-top':
		case 'border-right':
		case 'border-bottom':
		case 'border-left': {
			const side = prop === 'border' ? '' : prop.slice(7) + '-';
			if (v === 'none' || v === '0') return keep(`border-${side}width`, '0');
			let width: string | null = null;
			let color: string | null = null;
			let none = false;
			for (const w of words(v)) {
				if (PX_OR_NUM.test(w)) width = w;
				else if (w === 'thin') width = '1px';
				else if (w === 'medium') width = '3px';
				else if (w === 'thick') width = '5px';
				else if (/^(none|hidden)$/.test(w)) none = true;
				else if (/^(solid|dashed|dotted|double|groove|ridge|inset|outset)$/.test(w)) continue;
				else color = w;
			}
			const decls: [string, string][] = [[`border-${side}width`, none ? '0' : (width ?? '3px')]];
			if (color) decls.push(['border-color', color]);
			return { decls };
		}
		case 'flex': {
			if (v === 'none') return { decls: [['flex-grow', '0'], ['flex-shrink', '0']] };
			if (v === 'auto') return { decls: [['flex-grow', '1'], ['flex-shrink', '1']] };
			const parts = words(v);
			const decls: [string, string][] = [];
			if (parts.length === 1 && NUM.test(parts[0])) return { decls: [['flex-grow', parts[0]], ['flex-shrink', '1'], ['flex-basis', '0']] };
			if (parts[0] && NUM.test(parts[0])) decls.push(['flex-grow', parts[0]]);
			if (parts[1] && NUM.test(parts[1])) decls.push(['flex-shrink', parts[1]]);
			const basis = parts[parts.length - 1];
			if (parts.length >= 2 && !NUM.test(basis) || parts.length === 3) {
				if (/^0(%|px)?$/.test(basis)) decls.push(['flex-basis', '0']);
				else if (PX_OR_NUM.test(basis)) decls.push(['flex-basis', basis]);
			}
			return decls.length ? { decls } : drop(`\`flex: ${v}\` has no GPUI form`);
		}
		case 'padding-inline':
		case 'margin-inline':
		case 'padding-block':
		case 'margin-block': {
			const base = prop.split('-')[0];
			const [a, b = a] = words(v);
			const [s1, s2] = prop.endsWith('inline') ? ['left', 'right'] : ['top', 'bottom'];
			return { decls: [[`${base}-${s1}`, a], [`${base}-${s2}`, b]] };
		}
		case 'padding-inline-start':
		case 'margin-inline-start':
			return keep(`${prop.split('-')[0]}-left`, v);
		case 'padding-inline-end':
		case 'margin-inline-end':
			return keep(`${prop.split('-')[0]}-right`, v);
		case 'overflow':
		case 'overflow-x':
		case 'overflow-y':
			return keep(prop, v === 'auto' ? 'scroll' : v);
		case 'grid-template-columns':
		case 'grid-template-rows': {
			const m = /^repeat\(\s*(\d+)\s*,/.exec(v);
			if (m) return keep(prop, m[1]);
			return /^\d+$/.test(v) ? keep(prop, v) : drop(`\`${v}\`: GPUI grids take a track count`);
		}
		case 'line-height':
			if (NUM.test(v) && v !== '0') {
				if (rule_font_px !== null) return keep(prop, `${Math.round(parseFloat(v) * rule_font_px * 100) / 100}px`);
				return drop(`unitless \`line-height: ${v}\` would read as ${v}px in GPUI and the rule sets no px font-size`);
			}
			return keep(prop, v);
		case 'font-family':
			return keep(prop, is_var(v) ? v : first_family(v));
		case 'position':
			return v === 'sticky' ? drop('GPUI has no sticky positioning') : keep(prop, v);
	}

	if (WHY[prop]) return drop(WHY[prop]);
	if (prop.startsWith('-webkit-') || prop.startsWith('-moz-')) return drop('vendor-prefixed property');
	return keep(prop, v);
}

// --- the pass -----------------------------------------------------------------

export interface TranslateOptions {
	/** Name for the ledger, e.g. `fractalstyler/_04_containers.sass`. */
	source: string;
	tokens: TokenSets;
}

const weight = (rule: ClassRule) => rule.classes.length * 2 + (rule.tag === null ? 0 : 1);

export function translate_css(css: string, { source, tokens }: TranslateOptions): Translation {
	const rules: ClassRule[] = [];
	const losses: Loss[] = [];
	const defined = new Set<string>();

	const inline = (value: string) => reduce(substitute(value, (name) => tokens.invariant[name]));
	const runtime = (value: string, mode: 'light' | 'dark') => reduce(substitute(value, (name) => tokens[mode][name]));

	const lose = (selector: string, kind: Loss['kind'], detail: string, reason: string) =>
		losses.push({ selector, classes: classes_in(selector), kind, detail, reason, source });

	const visit = (nodes: Node[], context: string | null) => {
		for (const node of nodes) {
			if (node.type === 'atrule') {
				const prelude = `@${node.name} ${node.params}`.trim();
				if (node.children === null) continue;
				const inner = node.children.filter((c) => c.type === 'rule');
				if (inner.length === 0) {
					if (node.name !== 'font-face') lose(prelude, 'at-rule', prelude, `@${node.name} has no GPUI equivalent`);
					continue;
				}
				for (const r of inner) {
					if (r.type !== 'rule') continue;
					for (const c of classes_in(r.selector)) defined.add(c);
					if (node.name === 'keyframes') continue;
					lose(`${prelude} ${r.selector}`, 'at-rule', prelude, `@${node.name} has no GPUI equivalent; this variant never applies`);
				}
				if (node.name === 'keyframes') lose(prelude, 'at-rule', prelude, 'GPUI has no CSS animations');
				continue;
			}
			if (node.type !== 'rule') continue;

			const members = node.selector.split(',').map((s) => s.trim());
			if (members.every((m) => token_block(m))) continue;
			for (const m of members) for (const c of classes_in(m)) defined.add(c);

			const shapes: Exclude<ReturnType<typeof selector_shape>, string>[] = [];
			for (const m of members) {
				if (token_block(m)) continue;
				const shape = selector_shape(m);
				if (typeof shape === 'string') lose(context ? `${context} ${m}` : m, 'selector', m, shape);
				else shapes.push(shape);
			}
			if (shapes.length === 0) continue;

			const decls = node.children.filter((c): c is Declaration => c.type === 'decl' && !c.prop.startsWith('--'));
			// A font-size in the same rule lets a unitless line-height become px.
			const fs = decls.find((d) => d.prop === 'font-size');
			const fs_value = fs ? inline(fs.value) : null;
			const font_px = fs_value && PX_OR_NUM.test(fs_value) ? parseFloat(fs_value) : null;

			const out: string[] = [];
			for (const d of decls) {
				const value = inline(d.value);
				const rewritten = rewrite(d.prop, value, font_px);
				if (rewritten.loss) {
					lose(node.selector, 'declaration', `${d.prop}: ${d.value}`, rewritten.loss);
					continue;
				}
				for (const [prop, v] of rewritten.decls) {
					const problems = v.includes('var(')
						? [gpui_value_problem(prop, runtime(v, 'dark')), gpui_value_problem(prop, runtime(v, 'light'))]
						: [gpui_value_problem(prop, v)];
					const problem = problems.find((p) => p !== null);
					if (problem) lose(node.selector, 'declaration', `${d.prop}: ${d.value}`, problem);
					else out.push(`${prop}: ${v}`);
				}
			}
			if (out.length === 0) continue;

			const text = out.join('; ');
			// A var() only resolves at runtime, so a block that reads one ships as text.
			const body = text.includes('var(') ? { css: text } : { style: parse_css_text(text) };
			for (const s of shapes) rules.push({ ...s, ...body } as ClassRule);
		}
	};

	visit(parse(css).children, null);
	return { rules, losses, defined };
}

/** Weakest first, stable: later (stronger, or later in source) rules win when merged. */
export const sort_rules = (rules: ClassRule[]) => rules.map((r, i) => [r, i] as const).sort((a, b) => weight(a[0]) - weight(b[0]) || a[1] - b[1]).map(([r]) => r);
