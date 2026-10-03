/**
 * A forgiving-but-honest CSS parser: enough of CSS Syntax Level 3 to round-trip real
 * stylesheets (strings, escapes, comments anywhere, nested parens/brackets such as
 * `url(data:...;...)` or `:is(a, b)`, at-rules with and without blocks, and native
 * CSS nesting). It throws `CssParseError` with a position on structural errors
 * (unclosed block/string/comment, a stray `}`), which the UI surfaces verbatim.
 */

import type { AtRule, Comment, Declaration, Node, Position, Rule, Stylesheet } from './ast.ts';

export class CssParseError extends Error {
	line: number;
	column: number;

	constructor(message: string, at: Position) {
		super(`${message} (line ${at.line}, column ${at.column})`);
		this.name = 'CssParseError';
		this.line = at.line;
		this.column = at.column;
	}
}

/** Collapses runs of whitespace outside strings to one space, and trims. */
export function collapse(text: string): string {
	let out = '';
	let quote: string | null = null;
	let pending_space = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			out += ch;
			if (ch === '\\' && i + 1 < text.length) out += text[++i];
			else if (ch === quote) quote = null;
			continue;
		}
		if (/\s/.test(ch)) {
			pending_space = out.length > 0;
			continue;
		}
		if (pending_space) {
			out += ' ';
			pending_space = false;
		}
		if (ch === '"' || ch === "'") quote = ch;
		out += ch;
	}

	return out;
}

class Parser {
	private i = 0;
	private line = 1;
	private column = 1;

	constructor(private readonly src: string) {}

	private pos(): Position {
		return { line: this.line, column: this.column };
	}

	private advance(n = 1) {
		for (let k = 0; k < n && this.i < this.src.length; k++) {
			if (this.src[this.i] === '\n') {
				this.line++;
				this.column = 1;
			} else {
				this.column++;
			}
			this.i++;
		}
	}

	private skip_ws() {
		while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.advance();
	}

	private read_comment(): Comment {
		const start = this.pos();
		const end = this.src.indexOf('*/', this.i + 2);
		if (end === -1) throw new CssParseError('Unclosed comment', start);
		const text = this.src.slice(this.i + 2, end);
		this.advance(end + 2 - this.i);
		return { type: 'comment', text, start };
	}

	/**
	 * Reads one statement's prelude up to `{`, `;` or `}` at depth 0. Comments inside a
	 * prelude are lifted out into `comments` so they survive as separate nodes.
	 */
	private read_prelude(comments: Comment[]): { text: string; stop: '{' | ';' | '}' | 'eof'; start: Position } {
		const start = this.pos();
		let text = '';
		let depth = 0;

		while (this.i < this.src.length) {
			const ch = this.src[this.i];

			if (ch === '/' && this.src[this.i + 1] === '*') {
				comments.push(this.read_comment());
				text += ' ';
				continue;
			}
			if (ch === '"' || ch === "'") {
				const at = this.pos();
				text += ch;
				this.advance();
				while (true) {
					if (this.i >= this.src.length || this.src[this.i] === '\n') throw new CssParseError('Unclosed string', at);
					const c = this.src[this.i];
					text += c;
					this.advance();
					if (c === '\\') {
						text += this.src[this.i] ?? '';
						this.advance();
					} else if (c === ch) break;
				}
				continue;
			}
			if (ch === '\\') {
				text += ch + (this.src[this.i + 1] ?? '');
				this.advance(2);
				continue;
			}
			if (ch === '(' || ch === '[') depth++;
			else if ((ch === ')' || ch === ']') && depth > 0) depth--;
			else if (depth === 0 && (ch === '{' || ch === ';' || ch === '}')) {
				return { text, stop: ch, start };
			}

			text += ch;
			this.advance();
		}

		return { text, stop: 'eof', start };
	}

	/** Parses statements until the matching `}` (nested) or end of input (top level). */
	parse_block(nested: boolean, block_start?: Position): Node[] {
		const nodes: Node[] = [];

		while (true) {
			this.skip_ws();
			if (this.i >= this.src.length) {
				if (nested) throw new CssParseError('Unclosed block', block_start ?? this.pos());
				return nodes;
			}

			if (this.src[this.i] === '/' && this.src[this.i + 1] === '*') {
				nodes.push(this.read_comment());
				continue;
			}

			const comments: Comment[] = [];
			const { text, stop, start } = this.read_prelude(comments);
			const prelude = text.trim();

			if (stop === '}') {
				if (!nested) throw new CssParseError('Unexpected "}"', this.pos());
				nodes.push(...comments);
				if (prelude) nodes.push(this.declaration(prelude, start));
				this.advance();
				return nodes;
			}

			nodes.push(...comments);

			if (stop === '{') {
				const open = this.pos();
				this.advance();
				const children = this.parse_block(true, open);
				if (prelude.startsWith('@')) {
					const { name, params } = split_at_rule(prelude);
					nodes.push({ type: 'atrule', name, params, children, start } satisfies AtRule);
				} else {
					if (!prelude) throw new CssParseError('Block without a selector', start);
					nodes.push({ type: 'rule', selector: collapse(prelude), children, start } satisfies Rule);
				}
				continue;
			}

			// `;` or end of input
			if (stop === ';') this.advance();
			if (!prelude) continue;
			if (prelude.startsWith('@')) {
				const { name, params } = split_at_rule(prelude);
				nodes.push({ type: 'atrule', name, params, children: null, start } satisfies AtRule);
			} else {
				nodes.push(this.declaration(prelude, start));
			}
			if (stop === 'eof') {
				if (nested) throw new CssParseError('Unclosed block', block_start ?? start);
				return nodes;
			}
		}
	}

	private declaration(text: string, start: Position): Declaration {
		const colon = text.indexOf(':');
		if (colon <= 0) throw new CssParseError(`Expected "property: value", got "${collapse(text).slice(0, 40)}"`, start);
		const prop = text.slice(0, colon).trim();
		let value = collapse(text.slice(colon + 1));
		let important = false;
		const bang = /\s*!\s*important$/i.exec(value);
		if (bang) {
			important = true;
			value = value.slice(0, bang.index).trim();
		}
		// Custom properties keep their exact (collapsed) value; everything else is plain.
		return { type: 'decl', prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, important, start };
	}
}

function split_at_rule(prelude: string) {
	const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
	if (!m) return { name: prelude.slice(1).toLowerCase(), params: '' };
	return { name: m[1].toLowerCase(), params: collapse(m[2]) };
}

export function parse(css: string): Stylesheet {
	// A BOM would otherwise end up glued to the first selector.
	const src = css.charCodeAt(0) === 0xfeff ? css.slice(1) : css;
	return { type: 'stylesheet', children: new Parser(src).parse_block(false) };
}
