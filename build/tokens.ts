/**
 * Token flattener: fractalstyler's custom properties → flat px maps GPUI can use.
 *
 * GPUI has no `rem`, no `calc()`, and gpuix-svelte's `var()` substitution does not
 * resolve a variable whose value is another variable. So every token is resolved
 * here, once, per mode: nested `var()`s substituted (with fallbacks), `rem`/`em`
 * multiplied out against a 16px root, and `calc()` evaluated when it is plain
 * arithmetic on px and numbers. What cannot be reduced (`65ch`, `100dvh - …`,
 * shadows, easings) is kept as text and listed in `unresolved`.
 *
 * Token blocks are `:root` (both modes) and `[data-mode='light'|'dark']`.
 */

import { parse, type Node } from '../src/surfaces/css-to-sass/lib/index.ts';

export type Mode = 'light' | 'dark';
export type TokenMap = Record<string, string>;

export interface TokenSets {
	light: TokenMap;
	dark: TokenMap;
	/** Same value in both modes: safe to inline into class rules at build time. */
	invariant: TokenMap;
	/** `name: value` for tokens that did not reduce to something GPUI can read. */
	unresolved: string[];
}

export interface RawTokens {
	root: Map<string, string>;
	light: Map<string, string>;
	dark: Map<string, string>;
}

export const ROOT_FONT_SIZE = 16;

/** Which token block a selector is, or null when it is an ordinary rule. */
export function token_block(selector: string): 'root' | Mode | null {
	const s = selector.replace(/\s+/g, '');
	if (s === ':root' || s === 'html') return 'root';
	const m = /^(?::root|html)?\[data-mode=["']?(light|dark)["']?\]$/.exec(s);
	return m ? (m[1] as Mode) : null;
}

export function empty_raw(): RawTokens {
	return { root: new Map(), light: new Map(), dark: new Map() };
}

/** Collects custom properties from token blocks in compiled CSS (later wins). */
export function collect_tokens(css: string, into: RawTokens = empty_raw()): RawTokens {
	const walk = (nodes: Node[]) => {
		for (const n of nodes) {
			if (n.type === 'rule') {
				for (const sel of n.selector.split(',')) {
					const block = token_block(sel);
					if (!block) continue;
					for (const d of n.children) if (d.type === 'decl' && d.prop.startsWith('--')) into[block].set(d.prop.slice(2), d.value);
				}
			}
		}
	};
	walk(parse(css).children);
	return into;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

type Q = { n: number; unit: '' | 'px' };

/** Evaluates `+ - * /` over px and unitless numbers; null when anything else appears. */
function arith(expr: string, base: number): Q | null {
	const tokens = expr.match(/-?\d*\.?\d+(?:px|rem|em)?|[-+*/()]/g);
	if (!tokens || tokens.join('').length !== expr.replace(/\s+/g, '').replace(/calc\(/g, '(').length) return null;
	let i = 0;

	const atom = (): Q | null => {
		const t = tokens[i++];
		if (t === undefined) return null;
		if (t === '(') {
			const v = sum();
			if (tokens[i++] !== ')') return null;
			return v;
		}
		const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(t);
		if (!m) return null;
		const n = parseFloat(m[1]);
		if (m[2] === 'rem' || m[2] === 'em') return { n: n * base, unit: 'px' };
		return { n, unit: m[2] === 'px' ? 'px' : '' };
	};

	const product = (): Q | null => {
		let left = atom();
		while (left && (tokens[i] === '*' || tokens[i] === '/')) {
			const op = tokens[i++];
			const right = atom();
			if (!right) return null;
			if (op === '*') {
				if (left.unit && right.unit) return null;
				left = { n: left.n * right.n, unit: left.unit || right.unit };
			} else {
				if (right.unit || right.n === 0) return null;
				left = { n: left.n / right.n, unit: left.unit };
			}
		}
		return left;
	};

	const sum = (): Q | null => {
		let left = product();
		while (left && (tokens[i] === '+' || tokens[i] === '-')) {
			const op = tokens[i++];
			const right = product();
			if (!right) return null;
			// `0` is unit-agnostic in CSS arithmetic.
			const unit = left.unit || right.unit;
			if (left.unit !== right.unit && left.n !== 0 && right.n !== 0) return null;
			left = { n: op === '+' ? left.n + right.n : left.n - right.n, unit };
		}
		return left;
	};

	const out = sum();
	return out && i === tokens.length ? out : null;
}

/** Finds `name(` … `)` with balanced parens; returns [start, end) of the whole call. */
function find_call(value: string, name: string, from = 0): [number, number] | null {
	const start = value.indexOf(`${name}(`, from);
	if (start === -1) return null;
	let depth = 0;
	for (let i = start + name.length; i < value.length; i++) {
		if (value[i] === '(') depth++;
		else if (value[i] === ')' && --depth === 0) return [start, i + 1];
	}
	return null;
}

/** Substitutes `var(--x[, fallback])` through `lookup`; unknown names without fallback stay as written. */
export function substitute(value: string, lookup: (name: string) => string | undefined, depth = 0): string {
	if (depth > 16) return value;
	let out = value;
	let from = 0;
	for (;;) {
		const call = find_call(out, 'var', from);
		if (!call) return out;
		const inner = out.slice(call[0] + 4, call[1] - 1);
		const comma = inner.indexOf(',');
		const name = (comma === -1 ? inner : inner.slice(0, comma)).trim().replace(/^--/, '');
		const found = lookup(name);
		let replacement: string | undefined;
		if (found !== undefined) replacement = substitute(found, lookup, depth + 1);
		else if (comma !== -1) replacement = substitute(inner.slice(comma + 1).trim(), lookup, depth + 1);
		if (replacement === undefined) {
			from = call[1];
			continue;
		}
		out = out.slice(0, call[0]) + replacement + out.slice(call[1]);
		from = call[0] + replacement.length;
	}
}

/** `calc()` → px, and bare `rem`/`em` → px. Leaves anything it cannot reduce. */
export function reduce(value: string, base = ROOT_FONT_SIZE): string {
	let out = value;
	let from = 0;
	for (;;) {
		const call = find_call(out, 'calc', from);
		if (!call) break;
		const q = arith(out.slice(call[0] + 5, call[1] - 1), base);
		if (!q) {
			from = call[1];
			continue;
		}
		const text = fmt(q.n) + q.unit;
		out = out.slice(0, call[0]) + text + out.slice(call[1]);
		from = call[0] + text.length;
	}
	return out.replace(/(^|[\s(,])(-?\d*\.?\d+)r?em\b/g, (_, pre: string, n: string) => `${pre}${fmt(parseFloat(n) * base)}px`);
}

/** A reduced value GPUI cannot read (unit, calc, viewport…). */
export const irreducible = (value: string) => /calc\(|\d(?:ch|vh|vw|dvh|svh|lvh|vmin|vmax|ex|cap|lh)\b/.test(value);

export function flatten(raw: RawTokens, { base = ROOT_FONT_SIZE }: { base?: number } = {}): TokenSets {
	const resolve_mode = (mode: Mode): TokenMap => {
		const lookup = (name: string) => raw[mode].get(name) ?? raw.root.get(name);
		const names = new Set([...raw.root.keys(), ...raw[mode].keys()]);
		const out: TokenMap = {};
		for (const name of names) {
			let v = reduce(substitute(lookup(name)!, lookup), base);
			// GPUI takes one family name, not a fallback stack.
			if (/^font-/.test(name) && v.includes(',')) v = v.split(',')[0].trim().replace(/^["']|["']$/g, '');
			out[name] = v;
		}
		return out;
	};

	const light = resolve_mode('light');
	const dark = resolve_mode('dark');
	const invariant: TokenMap = {};
	const unresolved: string[] = [];
	for (const name of new Set([...Object.keys(light), ...Object.keys(dark)])) {
		if (light[name] !== undefined && light[name] === dark[name]) invariant[name] = light[name];
		for (const [mode, map] of [['light', light], ['dark', dark]] as const) {
			const v = map[name];
			if (v !== undefined && (irreducible(v) || v.includes('var('))) unresolved.push(`${mode} --${name}: ${v}`);
		}
	}
	return { light, dark, invariant, unresolved };
}
