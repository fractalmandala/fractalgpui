/**
 * Splits a complex selector into the "parts" the nesting pass works with:
 *
 *   `.btn.primary:hover > .icon`  →  [.btn] [&.primary] [&:hover] [> .icon]
 *
 * Every simple selector after the first in a compound becomes a `suffix` part (it
 * nests as `&…`), and every combinator starts a new part. Parens, brackets, strings
 * and escapes are respected, so `:is(.a .b)` and `[title="a b"]` stay whole.
 */

export type Combinator = '' | ' ' | '>' | '+' | '~' | 'suffix';

export interface Part {
	comb: Combinator;
	text: string;
}

/** Splits a selector list on top-level commas. */
export function split_list(selector: string): string[] {
	return split_top(selector, ',').map((s) => s.trim()).filter(Boolean);
}

function split_top(text: string, sep: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let cur = '';

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			cur += ch;
			if (ch === '\\') cur += text[++i] ?? '';
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '\\') {
			cur += ch + (text[++i] ?? '');
			continue;
		}
		if (ch === '"' || ch === "'") quote = ch;
		else if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth--;
		else if (depth === 0 && ch === sep) {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out;
}

/** True when the selector already uses `&` (native CSS nesting input). */
export const has_parent_ref = (selector: string) => split_top(selector, '&').length > 1;

export function split_parts(selector: string): Part[] {
	const parts: Part[] = [];
	let comb: Combinator = '';
	let cur = '';
	let in_compound = false;
	let depth = 0;
	let quote: string | null = null;

	const flush = () => {
		if (cur) parts.push({ comb, text: cur });
		cur = '';
	};

	const s = selector.trim();
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];

		if (quote) {
			cur += ch;
			if (ch === '\\') cur += s[++i] ?? '';
			else if (ch === quote) quote = null;
			continue;
		}
		if (depth > 0) {
			cur += ch;
			if (ch === '"' || ch === "'") quote = ch;
			else if (ch === '(' || ch === '[') depth++;
			else if (ch === ')' || ch === ']') depth--;
			continue;
		}

		if (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~') {
			// A combinator (possibly whitespace around > + ~).
			let j = i;
			let explicit: Combinator = ' ';
			while (j < s.length && (/\s/.test(s[j]) || s[j] === '>' || s[j] === '+' || s[j] === '~')) {
				if (s[j] !== ' ' && !/\s/.test(s[j])) explicit = s[j] as Combinator;
				j++;
			}
			flush();
			comb = explicit;
			in_compound = false;
			i = j - 1;
			continue;
		}

		const starts_simple = ch === '.' || ch === '#' || ch === '[' || (ch === ':' && s[i - 1] !== ':');
		if (in_compound && starts_simple && cur) {
			flush();
			comb = 'suffix';
		}
		in_compound = true;

		if (ch === '\\') {
			cur += ch + (s[++i] ?? '');
			continue;
		}
		if (ch === '"' || ch === "'") quote = ch;
		else if (ch === '(' || ch === '[') depth++;
		cur += ch;
	}
	flush();
	return parts;
}

/** The identity used to match parts against open nesting levels. */
export const part_key = (p: Part) => `${p.comb}\u0000${p.text}`;

/**
 * Renders parts as a selector fragment. `nested` means the first part is written
 * inside a parent block, so it needs `&` (suffix) or an explicit combinator prefix.
 *
 * In the indented syntax a line starting with `+` is `@include` and `=` is `@mixin`,
 * and a nested line starting with `:` reads as a property, so those get `& `.
 */
export function render_parts(parts: Part[], nested: boolean): string {
	let out = '';
	parts.forEach((p, idx) => {
		if (idx === 0) {
			if (!nested) {
				out = p.text;
			} else if (p.comb === 'suffix') {
				out = `&${p.text}`;
			} else if (p.comb === '>' || p.comb === '+' || p.comb === '~') {
				out = `& ${p.comb} ${p.text}`;
			} else if (/^[:+=~>@]/.test(p.text)) {
				out = `& ${p.text}`;
			} else {
				out = p.text;
			}
			return;
		}
		if (p.comb === 'suffix') out += p.text;
		else if (p.comb === ' ' || p.comb === '') out += ` ${p.text}`;
		else out += ` ${p.comb} ${p.text}`;
	});
	return out;
}
