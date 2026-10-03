/**
 * fractalstyler class audit: runs the real adapter (gpui-css.ts) over fractalstyler's
 * source, one selector at a time, and sorts every selector into
 *
 *   Clean    every declaration reaches GPUI (after translation),
 *   Partial  some declarations are dropped (which, and why),
 *   Dropped  the selector is refused, or nothing survives.
 *
 * Each selector is also checked "raw" (compiled CSS handed to gpuix as-is, no
 * translation, tokens unflattened) so the doc can say what the adapter rescues.
 * Selectors are grouped by the fractalstyler partial they come from (via the Sass
 * source map); numeric series (`.gap-1` … `.gap-12`) collapse into one row.
 *
 *   bun run audit:classes                                  rewrite it in assets/css-learn.md
 *   gpuix-svelte --bun build/audit-classes.ts              print it instead
 *
 * (Run through gpuix-svelte: the adapter imports gpuix's CSS parser, which needs its
 * renderer build.)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { compile, compileString } from 'sass';
import { parse, type Node, type Rule } from '../src/surfaces/tools/css-to-sass/lib/index.ts';
import { FRACTALSTYLER_STYLES, list_partials } from './fractalstyler.ts';
import { gpui_value_problem, translate_css } from './gpui-css.ts';
import { collect_tokens, empty_raw, flatten, substitute, token_block } from './tokens.ts';

const DOC = fileURLToPath(new URL('../assets/css-learn.md', import.meta.url));
const START = '<!-- audit:start -->';
const END = '<!-- audit:end -->';

// --- compile with a source map -------------------------------------------------

const silent = { warn() {}, debug() {} };

function compile_mapped(dir: string): { css: string; sources: string[]; mappings: string; mode: string } {
	const options = { style: 'expanded' as const, charset: false, loadPaths: [dir], logger: silent, sourceMap: true };
	const index = join(dir, 'index.sass');
	if (existsSync(index)) {
		try {
			const r = compile(index, options);
			return { css: r.css, sources: r.sourceMap!.sources, mappings: r.sourceMap!.mappings, mode: 'index.sass' };
		} catch {
			// fall through to the partials, as build/fractalstyler.ts does
		}
	}
	const entry = list_partials(dir).map((f) => `@use '${f.replace(/^_/, '').replace(/\.s[ac]ss$/, '')}' as *`).join('\n');
	const r = compileString(entry, { ...options, syntax: 'indented', url: new URL(`file://${join(dir, '__entry.sass')}`) });
	return { css: r.css, sources: r.sourceMap!.sources, mappings: r.sourceMap!.mappings, mode: 'every `_NN_*.sass` partial (index.sass does not compile)' };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Generated line (0-based) → source index of its first mapped segment. */
function line_sources(mappings: string): (number | null)[] {
	const out: (number | null)[] = [];
	let src = 0;
	for (const line of mappings.split(';')) {
		let first: number | null = null;
		for (const seg of line.split(',')) {
			if (!seg) continue;
			const vals: number[] = [];
			let v = 0;
			let shift = 0;
			for (const ch of seg) {
				const d = B64.indexOf(ch);
				v += (d & 31) << shift;
				if (d & 32) shift += 5;
				else {
					vals.push(v & 1 ? -(v >> 1) : v >> 1);
					v = 0;
					shift = 0;
				}
			}
			if (vals.length >= 4) {
				src += vals[1];
				// later fields (line, column, name) are relative too, but only the source matters here
				if (first === null) first = src;
			}
		}
		out.push(first);
	}
	return out;
}

/** What the adapter does about a raw problem, as a short label. */
function raw_category(prop: string, v: string): string {
	if (prop === 'background') return 'background shorthand';
	if (/^border(-(top|right|bottom|left))?$/.test(prop)) return 'border shorthand';
	if (prop === 'flex') return 'flex shorthand';
	if (/-(inline|block)(-start|-end)?$/.test(prop)) return 'logical sides';
	if (/^grid-template-/.test(prop)) return 'grid repeat()';
	if (prop === 'line-height' && /^\d*\.?\d+$/.test(v)) return 'unitless line-height';
	if (/^overflow/.test(prop) && v === 'auto') return 'overflow: auto';
	if (/calc\(/.test(v)) return 'calc()';
	if (/\d(r?em)\b/.test(v)) return 'rem';
	return prop;
}

// --- per-selector audit --------------------------------------------------------

type Status = 'clean' | 'partial' | 'dropped';
interface Entry {
	partial: string;
	context: string | null;
	selector: string;
	status: Status;
	/** "prop: value — reason" for each dropped declaration, or the selector's reason. */
	losses: string[];
	noop: boolean;
	raw: Status;
	raw_losses: string[];
}

/** Splits a selector list on top-level commas. */
function members(selector: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of selector) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			out.push(cur.trim());
			cur = '';
		} else cur += ch;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

function to_css(n: Node): string {
	if (n.type === 'decl') return `${n.prop}: ${n.value}${n.important ? ' !important' : ''};`;
	if (n.type === 'rule') return `${n.selector} { ${n.children.map(to_css).join(' ')} }`;
	if (n.type === 'atrule') return n.children === null ? `@${n.name} ${n.params};` : `@${n.name} ${n.params} { ${n.children.map(to_css).join(' ')} }`;
	return '';
}

const GPUI_SELECTOR = /^([a-zA-Z][\w-]*)?((?:\.-?[_a-zA-Z][\w-]*)+)(?::(hover|active))?$/;

function audit(): { entries: Entry[]; mode: string; partials: string[]; at_rules: { partial: string; prelude: string }[] } {
	const { css, sources, mappings, mode } = compile_mapped(FRACTALSTYLER_STYLES);
	const lines = line_sources(mappings);
	const partial_of = (line: number) => {
		const i = lines[line - 1];
		return i === null || i === undefined ? '?' : basename(decodeURIComponent(sources[i]));
	};

	const raw_tokens = collect_tokens(css, empty_raw());
	const tokens = flatten(raw_tokens);
	const raw_lookup = (name: string) => raw_tokens.dark.get(name) ?? raw_tokens.root.get(name);

	const entries: Entry[] = [];
	const at_rules: { partial: string; prelude: string }[] = [];

	const one = (rule: Rule, member: string, context: { name: string; params: string } | null, partial: string) => {
		const body = rule.children.map(to_css).join(' ');
		const text = context ? `@${context.name} ${context.params} { ${member} { ${body} } }` : `${member} { ${body} }`;
		const t = translate_css(text, { source: partial, tokens });
		const decl_losses = t.losses.filter((l) => l.kind === 'declaration').map((l) => `\`${l.detail}\` — ${l.reason}`);
		const other = t.losses.filter((l) => l.kind !== 'declaration').map((l) => l.reason);
		const kept = t.rules.length > 0;
		const status: Status = other.length || (!kept && decl_losses.length) ? 'dropped' : decl_losses.length ? 'partial' : 'clean';

		// Raw: gpuix's own compiler on the untranslated CSS (same selector rules; values as written).
		const decls = rule.children.filter((c) => c.type === 'decl' && !c.prop.startsWith('--'));
		const raw_losses: string[] = [];
		let raw_ok = 0;
		const shape_ok = GPUI_SELECTOR.test(member) || /^[a-zA-Z][\w-]*$/.test(member);
		if (context) raw_losses.push(`@${context.name}`);
		else if (!shape_ok) raw_losses.push('selector');
		else
			for (const d of decls) {
				if (d.type !== 'decl') continue;
				const v = substitute(d.value, raw_lookup).trim();
				let p = gpui_value_problem(d.prop, v);
				if (!p && d.prop === 'line-height' && /^\d*\.?\d+$/.test(v) && v !== '0') p = 'unitless line-height reads as px';
				if (p) raw_losses.push(raw_category(d.prop, v));
				else raw_ok++;
			}
		const raw: Status = context || !shape_ok || (raw_ok === 0 && raw_losses.length) ? 'dropped' : raw_losses.length ? 'partial' : 'clean';
		entries.push({
			partial,
			context: context ? `@${context.name} ${context.params}` : null,
			selector: member,
			status,
			losses: status === 'dropped' && other.length ? [...new Set(other)] : decl_losses,
			noop: status === 'clean' && !kept,
			raw,
			raw_losses: [...new Set(raw_losses)]
		});
	};

	for (const node of parse(css).children) {
		if (node.type === 'rule') {
			const partial = partial_of(node.start.line);
			for (const m of members(node.selector)) if (!token_block(m)) one(node, m, null, partial);
		} else if (node.type === 'atrule' && node.children) {
			const partial = partial_of(node.start.line);
			const inner = node.children.filter((c): c is Rule => c.type === 'rule');
			if (node.name === 'keyframes' || node.name === 'font-face' || inner.length === 0) {
				at_rules.push({ partial, prelude: `@${node.name} ${node.params}`.trim() });
				continue;
			}
			for (const r of inner) for (const m of members(r.selector)) if (!token_block(m)) one(r, m, { name: node.name, params: node.params }, partial);
		}
	}
	return { entries, mode, partials: list_partials(FRACTALSTYLER_STYLES), at_rules };
}

// --- markdown ------------------------------------------------------------------

/** A series member: `.gap-` + `12` / `md` / `2xl` (+ optional `:hover`). */
const SERIES = /^(.*?[a-z-])(\d+(?:\.\d+)?|xs|sm|md|bs|lg|xl|\d+xl)((?::\w+)?)$/;

/** Collapses `.gap-1 … .gap-12` or `.gap-xs … .gap-3xl` (same status and reasons) into one row. */
function compress(list: Entry[], key: (e: Entry) => string): { label: string; entries: Entry[] }[] {
	const groups = new Map<string, { first: string; stem: [string, string] | null; entries: Entry[]; steps: string[] }>();
	const order: string[] = [];
	for (const e of list) {
		const m = SERIES.exec(e.selector);
		const k = `${m ? `${m[1]}\u0000${m[3]}` : e.selector}|${key(e)}`;
		if (!groups.has(k)) {
			groups.set(k, { first: e.selector, stem: m ? [m[1], m[3]] : null, entries: [], steps: [] });
			order.push(k);
		}
		const g = groups.get(k)!;
		g.entries.push(e);
		if (m) g.steps.push(m[2]);
	}
	return order.map((k) => {
		const g = groups.get(k)!;
		if (g.entries.length < 2) return { label: `\`${g.first}\``, entries: g.entries };
		const steps = [...new Set(g.steps)];
		if (!g.stem || steps.length < 2) return { label: `\`${g.first}\` (×${g.entries.length})`, entries: g.entries };
		const series = steps.length > 3 ? `${steps[0]}..${steps[steps.length - 1]}` : steps.join(',');
		return { label: `\`${g.stem[0]}{${series}}${g.stem[1]}\` (${g.entries.length})`, entries: g.entries };
	});
}

const esc = (s: string) => s.replace(/\|/g, '\\|');

/** A loss list with the concrete values blanked, so `span 1` and `span 2` read the same. */
const norm = (losses: string[]) =>
	losses.map((l) => l.replace(/`[^`]*`/g, (m, i) => (i === 0 ? m.replace(/:.*`$/, '`') : '`…`')).replace(/-?\d+(\.\d+)?/g, 'N')).join(';');

/** Series-compresses, then merges rows that share a key into one row. */
function rows(list: Entry[], key: (e: Entry) => string): { label: string; entries: Entry[]; varies: boolean }[] {
	const merged = new Map<string, { labels: string[]; entries: Entry[] }>();
	for (const r of compress(list, key)) {
		const k = key(r.entries[0]);
		if (!merged.has(k)) merged.set(k, { labels: [], entries: [] });
		const m = merged.get(k)!;
		m.labels.push(r.label);
		m.entries.push(...r.entries);
	}
	return [...merged.values()].map((m) => ({
		label: m.labels.length > 16 ? `${m.labels.slice(0, 16).join(', ')}, … (${m.labels.length - 16} more)` : m.labels.join(', '),
		entries: m.entries,
		varies: new Set(m.entries.map((e) => e.losses.join(';'))).size > 1
	}));
}

const losses_cell = (r: { entries: Entry[]; varies: boolean }) => (r.varies ? 'e.g. ' : '') + r.entries[0].losses.join('<br>');

function raw_note(e: Entry): string {
	// Same status, and raw loses nothing the adapter does not: nothing to say.
	if (e.raw === e.status && e.raw_losses.length <= e.losses.length) return '';
	if (e.raw === 'clean') return 'raw: clean';
	return `raw: ${e.raw}${e.raw_losses.length ? ` (${e.raw_losses.slice(0, 6).join(', ')}${e.raw_losses.length > 6 ? ', …' : ''})` : ''}`;
}

function section(): string {
	const { entries, mode, partials, at_rules } = audit();
	const by = (s: Status) => entries.filter((e) => e.status === s);
	const clean = by('clean');
	const partial = by('partial');
	const dropped = by('dropped');
	const plain = entries.filter((e) => !e.context);
	const rescued = entries.filter((e) => e.status === 'clean' && e.raw !== 'clean');
	const fs_rev = (() => {
		try {
			const rev = execFileSync('git', ['log', '-1', '--format=%h %cs', '--', '.'], { cwd: FRACTALSTYLER_STYLES }).toString().trim();
			const dirty = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: FRACTALSTYLER_STYLES }).toString().trim();
			return `${rev}${dirty ? ' + uncommitted changes' : ''}`;
		} catch {
			return 'unknown revision';
		}
	})();

	const out: string[] = [];
	out.push(START, '');
	out.push(`Generated by \`bun run audit:classes\` (\`build/audit-classes.ts\`; do not edit by hand). Source: \`packages/fractalstyler/src/lib/styles\` at ${fs_rev}, compiled from ${mode}; fractalstyler's own tokens (not the app's overrides).`, '');
	out.push('Each selector is translated on its own by the real adapter (`build/gpui-css.ts`). A selector list (`.a, .b`) counts once per member; a variant inside `@media` / `@supports` counts as its own entry.', '');
	out.push('| | Selectors |', '|---|---|');
	out.push(`| Total | ${entries.length} (${plain.length} top-level, ${entries.length - plain.length} inside at-rules) |`);
	out.push(`| Clean | ${clean.length} (${clean.filter((e) => e.noop).length} of them no-ops in GPUI, e.g. \`display: block\`) |`);
	out.push(`| Partial | ${partial.length} |`);
	out.push(`| Dropped entirely | ${dropped.length} (${dropped.filter((e) => e.context).length} of them inside at-rules) |`);
	out.push(`| Clean only because of the adapter (raw would lose something) | ${rescued.length} |`);
	out.push(`| Other at-rules (\`@keyframes\`, \`@font-face\`, …) | ${at_rules.length} |`, '');

	const reasons = new Map<string, number>();
	for (const e of rescued) for (const r of e.raw_losses) reasons.set(r, (reasons.get(r) ?? 0) + 1);
	out.push(`**Raw vs adapter.** Handed to gpuix untranslated, ${entries.filter((e) => e.raw === 'clean').length} selectors would be clean, ${entries.filter((e) => e.raw === 'partial').length} partial and ${entries.filter((e) => e.raw === 'dropped').length} dropped. The adapter rescues ${rescued.length}; the properties it rescues most: ${[...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => `\`${p}\` (${n})`).join(', ')}. Rows below say \`raw: …\` where raw differs.`, '');

	const ordered = (list: Entry[]) => [...new Set([...partials, ...list.map((e) => e.partial)])].filter((p) => list.some((e) => e.partial === p));

	out.push('### Clean pass', '');
	for (const p of ordered(clean)) {
		const list = rows(clean.filter((e) => e.partial === p), (e) => `${e.noop}|${raw_note(e)}`);
		out.push(`**${p}** (${clean.filter((e) => e.partial === p).length})`, '');
		const notes = list.filter((r) => r.entries[0].noop || raw_note(r.entries[0]));
		const plain_rows = list.filter((r) => !notes.includes(r));
		if (plain_rows.length) out.push(plain_rows.map((r) => r.label).join(', '), '');
		if (notes.length) {
			out.push('| Selector | Note |', '|---|---|');
			for (const r of notes) out.push(`| ${esc(r.label)} | ${[r.entries[0].noop ? 'no-op in GPUI (its declarations are GPUI defaults)' : '', raw_note(r.entries[0])].filter(Boolean).join('; ')} |`);
			out.push('');
		}
	}

	out.push('### Partial', '');
	for (const p of ordered(partial)) {
		out.push(`**${p}** (${partial.filter((e) => e.partial === p).length})`, '', '| Selector | Dropped (why) | Raw |', '|---|---|---|');
		for (const r of rows(partial.filter((e) => e.partial === p), (e) => `${norm(e.losses)}|${raw_note(e)}`)) {
			out.push(`| ${esc(r.label)} | ${esc(losses_cell(r))} | ${esc(raw_note(r.entries[0]))} |`);
		}
		out.push('');
	}

	out.push('### Dropped entirely', '');
	for (const p of ordered(dropped)) {
		out.push(`**${p}** (${dropped.filter((e) => e.partial === p).length})`, '', '| Selector | Reason | Raw |', '|---|---|---|');
		// At-rule variants: one row per at-rule prelude.
		const ctx = new Map<string, Entry[]>();
		for (const e of dropped.filter((e) => e.partial === p && e.context)) ctx.set(e.context!, [...(ctx.get(e.context!) ?? []), e]);
		for (const r of rows(dropped.filter((e) => e.partial === p && !e.context), (e) => `${norm(e.losses)}|${raw_note(e)}`)) {
			out.push(`| ${esc(r.label)} | ${esc(losses_cell(r))} | ${esc(raw_note(r.entries[0]))} |`);
		}
		for (const [c, list] of ctx) {
			const names = compress(list, () => '').map((r) => r.label);
			out.push(`| \`${esc(c)}\` × ${list.length}: ${esc(names.slice(0, 12).join(', '))}${names.length > 12 ? `, … (${names.length - 12} more)` : ''} | ${esc(c.split(' ')[0])} has no GPUI equivalent; these variants never apply | |`);
		}
		out.push('');
	}

	if (at_rules.length) {
		out.push('### Other at-rules', '', 'Not class rules; none reach GPUI (fonts come from the Mac by family name; there are no CSS animations).', '', '| Partial | At-rule |', '|---|---|');
		const counted = new Map<string, number>();
		for (const a of at_rules) {
			const k = `${a.partial}|${a.prelude.startsWith('@keyframes') ? a.prelude : `@${a.prelude.slice(1).split(' ')[0]}`}`;
			counted.set(k, (counted.get(k) ?? 0) + 1);
		}
		for (const [k, n] of counted) {
			const [partial, prelude] = k.split('|');
			out.push(`| ${partial} | \`${esc(prelude)}\`${n > 1 ? ` × ${n}` : ''} |`);
		}
		out.push('');
	}
	out.push(END);
	return out.join('\n');
}

const md = section();
if (process.argv.includes('--write')) {
	const doc = readFileSync(DOC, 'utf8');
	const a = doc.indexOf(START);
	const b = doc.indexOf(END);
	if (a === -1 || b === -1) throw new Error(`${DOC} has no ${START} … ${END} block`);
	writeFileSync(DOC, doc.slice(0, a) + md + doc.slice(b + END.length));
	console.log(`wrote the audit into ${DOC}`);
} else console.log(md);
