/**
 * CSS → indented Sass.
 *
 * Nesting is *order-preserving*: a rule only nests under a parent that is still
 * "open" (the chain of the rule written just before it), so the compiled output has
 * exactly the source order and the cascade cannot change. Shared prefixes are
 * opened as empty parent blocks only when the next rule shares them too. A media /
 * supports / container block whose rules all target the selector just written is
 * folded into that selector as a nested `@media`.
 */

import type { AtRule, Comment, Declaration, Node, Rule } from './ast.ts';
import { parse } from './parse.ts';
import { has_parent_ref, part_key, render_parts, split_list, split_parts, type Part } from './selector.ts';

export interface ConvertOptions {
	/** One indentation level. Default: a tab. */
	indent?: string;
	/** Nest selectors that share a prefix. Default: true. */
	nest?: boolean;
	/**
	 * `silent` turns comments into `//` lines (the Sass idiom; not emitted to CSS),
	 * `loud` keeps them as `/* *\/` comments, `drop` removes them. `/*! … *\/`
	 * (preserved/licence) comments are always kept loud. Default: `silent`.
	 */
	comments?: 'silent' | 'loud' | 'drop';
	/** Fold `@media` blocks that only restyle the previous selector into it. Default: true. */
	nestMedia?: boolean;
}

export interface ConvertStats {
	rules: number;
	nested: number;
	atRules: number;
	comments: number;
	declarations: number;
}

export interface ConvertResult {
	sass: string;
	warnings: string[];
	stats: ConvertStats;
}

/** Output tree. A `block` prints as `selector` + indented children. */
type Out =
	| { kind: 'block'; head: string; key: string | null; children: Out[]; virtual?: boolean }
	| { kind: 'decl'; text: string }
	| { kind: 'comment'; text: string; loud: boolean }
	| { kind: 'line'; text: string };

const NESTABLE_AT = new Set(['media', 'supports', 'container']);

interface Ctx {
	opts: Required<ConvertOptions>;
	warnings: string[];
	stats: ConvertStats;
}

export function css_to_sass(css: string, options: ConvertOptions = {}): ConvertResult {
	const opts: Required<ConvertOptions> = {
		indent: options.indent ?? '\t',
		nest: options.nest ?? true,
		comments: options.comments ?? 'silent',
		nestMedia: options.nestMedia ?? true
	};
	const ctx: Ctx = {
		opts,
		warnings: [],
		stats: { rules: 0, nested: 0, atRules: 0, comments: 0, declarations: 0 }
	};

	const sheet = parse(css);
	const top: Out[] = [];
	convert_list(sheet.children, top, ctx);

	const lines: string[] = [];
	print(top, 0, lines, opts.indent);
	// One blank line between top-level blocks reads like hand-written Sass.
	const sass = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
	return { sass: sass ? `${sass}\n` : '', warnings: ctx.warnings, stats: ctx.stats };
}

// --- conversion ---------------------------------------------------------------

interface Open {
	block: Extract<Out, { kind: 'block' }>;
	/** The part this level matched, or null when it can never be matched (a list). */
	key: string | null;
}

function comment_out(c: Comment, ctx: Ctx): Out | null {
	const loud = c.text.startsWith('!') || ctx.opts.comments === 'loud';
	if (!loud && ctx.opts.comments === 'drop') return null;
	ctx.stats.comments++;
	return { kind: 'comment', text: c.text, loud };
}

function decl_out(d: Declaration, ctx: Ctx): Out | null {
	if (/^[*_]/.test(d.prop)) {
		ctx.warnings.push(`Dropped IE hack property "${d.prop}" (line ${d.start.line})`);
		return null;
	}
	if (d.value === '' && !d.prop.startsWith('--')) {
		ctx.warnings.push(`Dropped empty declaration "${d.prop}" (line ${d.start.line})`);
		return null;
	}
	ctx.stats.declarations++;
	// `#{` inside a value would be Sass interpolation.
	const value = d.value.replace(/#\{/g, '\\#{');
	return { kind: 'decl', text: `${d.prop}: ${value}${d.important ? ' !important' : ''}` };
}

/** True when a rule node produces nothing (no declarations anywhere inside). */
function is_empty(nodes: Node[]): boolean {
	return nodes.every((n) => n.type === 'comment' || (n.type === 'rule' && is_empty(n.children)) || (n.type === 'atrule' && n.children !== null && is_empty(n.children)));
}

function next_rule(nodes: Node[], from: number): Rule | null {
	for (let i = from; i < nodes.length; i++) {
		const n = nodes[i];
		if (n.type === 'comment') continue;
		return n.type === 'rule' ? n : null;
	}
	return null;
}

function common_prefix(a: Part[], b: Part[]) {
	let n = 0;
	while (n < a.length && n < b.length && part_key(a[n]) === part_key(b[n])) n++;
	return n;
}

/** Converts a statement list (top level, or the inside of an at-rule) into `out`. */
function convert_list(nodes: Node[], out: Out[], ctx: Ctx) {
	const stack: Open[] = [];
	let pending: Out[] = [];

	const container = (depth: number) => (depth === 0 ? out : stack[depth - 1].block.children);
	const flush_comments = (into: Out[]) => {
		into.push(...pending);
		pending = [];
	};

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];

		if (node.type === 'comment') {
			const c = comment_out(node, ctx);
			if (c) pending.push(c);
			continue;
		}

		if (node.type === 'decl') {
			ctx.warnings.push(`Declaration "${node.prop}" outside any rule was dropped (line ${node.start.line})`);
			continue;
		}

		if (node.type === 'atrule') {
			ctx.stats.atRules++;
			if (
				ctx.opts.nest &&
				ctx.opts.nestMedia &&
				node.children &&
				NESTABLE_AT.has(node.name) &&
				stack.length > 0 &&
				fold_media(node, stack, ctx)
			) {
				// Folded into the open selector; comments go with it.
				const top = stack[stack.length - 1].block;
				top.children.splice(top.children.length - 1, 0, ...pending);
				pending = [];
				continue;
			}
			stack.length = 0;
			flush_comments(out);
			out.push(at_rule_out(node, ctx));
			continue;
		}

		// A rule.
		ctx.stats.rules++;
		if (is_empty(node.children)) {
			// Empty rules emit nothing in CSS; keep any comments inside them.
			for (const c of node.children) if (c.type === 'comment') {
				const o = comment_out(c, ctx);
				if (o) pending.push(o);
			}
			continue;
		}

		const members = split_list(node.selector);
		const nestable = ctx.opts.nest && members.length > 0 && !members.some(has_parent_ref);

		if (!nestable) {
			stack.length = 0;
			flush_comments(out);
			const block = rule_block(node.selector, null, node.children, ctx);
			out.push(block);
			continue;
		}

		const parts_list = members.map(split_parts);
		const keys = stack.map((s) => s.key);

		// Deepest open level every member continues from.
		let k = 0;
		while (
			k < stack.length &&
			keys[k] !== null &&
			parts_list.every((p) => p.length > k && part_key(p[k]) === keys[k])
		) {
			k++;
		}

		// Same single selector as the innermost open block, which has nothing after
		// its own declarations yet: append there instead of repeating the selector.
		if (parts_list.length === 1 && k === parts_list[0].length && k === stack.length) {
			const top = stack[k - 1].block;
			if (top.children.every((c) => c.kind === 'decl' || c.kind === 'comment') && !top.virtual) {
				flush_comments(top.children);
				append_children(top, node.children, ctx);
				continue;
			}
			k--;
		}
		// Every member must keep at least one part of its own below the parent.
		while (k > 0 && parts_list.some((p) => p.length <= k)) k--;

		stack.length = k;
		if (k > 0) ctx.stats.nested++;

		// Open shared levels the next rule will reuse: the prefix every member of this
		// rule and of the next one have in common.
		{
			const parts = parts_list[0];
			const next = next_rule(nodes, i + 1);
			if (next && !has_parent_ref(next.selector)) {
				let shared = parts.length;
				for (const p of parts_list) shared = Math.min(shared, common_prefix(parts, p), p.length - 1);
				for (const m of split_list(next.selector)) shared = Math.min(shared, common_prefix(parts, split_parts(m)));
				// `shared` never swallows a member's last part: that holds the declarations.
				while (stack.length < shared) {
					const d = stack.length;
					const block: Extract<Out, { kind: 'block' }> = {
						kind: 'block',
						head: render_parts([parts[d]], d > 0),
						key: part_key(parts[d]),
						children: [],
						virtual: true
					};
					flush_comments(container(d));
					container(d).push(block);
					stack.push({ block, key: block.key });
					ctx.stats.nested++;
				}
			}
		}

		if (parts_list.length === 1) {
			const parts = parts_list[0];
			const d = stack.length;
			const rest = parts.slice(d);
			const key = rest.length === 1 ? part_key(rest[0]) : null;
			const block = rule_block(render_parts(rest, d > 0), key, node.children, ctx);
			flush_comments(container(d));
			container(d).push(block);
			stack.push({ block, key });
			continue;
		}

		const d = stack.length;
		const head = parts_list.map((p) => render_parts(p.slice(d), d > 0)).join(', ');
		const block = rule_block(head, null, node.children, ctx);
		flush_comments(container(d));
		container(d).push(block);
		stack.push({ block, key: null });
	}

	flush_comments(stack.length ? stack[stack.length - 1].block.children : out);
}

function rule_block(head: string, key: string | null, children: Node[], ctx: Ctx): Extract<Out, { kind: 'block' }> {
	const block: Extract<Out, { kind: 'block' }> = { kind: 'block', head, key, children: [] };
	append_children(block, children, ctx);
	return block;
}

/** A rule's own contents: declarations, comments, and (native CSS) nested rules / at-rules. */
function append_children(block: Extract<Out, { kind: 'block' }>, children: Node[], ctx: Ctx) {
	for (const child of children) {
		if (child.type === 'decl') {
			const d = decl_out(child, ctx);
			if (d) block.children.push(d);
		} else if (child.type === 'comment') {
			const c = comment_out(child, ctx);
			if (c) block.children.push(c);
		} else if (child.type === 'rule') {
			if (is_empty(child.children)) continue;
			ctx.stats.rules++;
			// Native nesting: `&` is already explicit; a bare nested selector is a descendant.
			const head = split_list(child.selector)
				.map((m) => (has_parent_ref(m) ? m : render_parts(split_parts(m), true)))
				.join(', ');
			block.children.push(rule_block(head, null, child.children, ctx));
		} else {
			ctx.stats.atRules++;
			block.children.push(at_rule_out(child, ctx));
		}
	}
}

/** `@media` that only restyles the innermost open selector becomes a nested `@media`. */
function fold_media(node: AtRule, stack: Open[], ctx: Ctx): boolean {
	const children = node.children!;
	const rules = children.filter((c) => c.type !== 'comment');
	if (rules.length === 0 || !rules.every((r) => r.type === 'rule')) return false;

	const path = stack.map((s) => s.key);
	if (path.some((k) => k === null)) return false;
	for (const r of rules as Rule[]) {
		const members = split_list(r.selector);
		if (members.length !== 1 || has_parent_ref(members[0])) return false;
		const parts = split_parts(members[0]);
		if (parts.length !== path.length || parts.some((p, idx) => part_key(p) !== path[idx])) return false;
	}

	const top = stack[stack.length - 1].block;
	const media: Extract<Out, { kind: 'block' }> = { kind: 'block', head: `@${node.name} ${node.params}`.trim(), key: null, children: [] };
	for (const c of children) {
		if (c.type === 'comment') {
			const o = comment_out(c, ctx);
			if (o) media.children.push(o);
		} else append_children(media, (c as Rule).children, ctx);
	}
	top.children.push(media);
	ctx.stats.nested++;
	return true;
}

function at_rule_out(node: AtRule, ctx: Ctx): Out {
	const head = `@${node.name}${node.params ? ` ${node.params}` : ''}`;

	if (node.children === null) {
		if (node.name === 'import' && !/^url\(|\.css["']?(\s|$)|^["']?(https?:)?\/\//.test(node.params)) {
			ctx.warnings.push(`@import ${node.params} will be read as a Sass import; write url(...) to keep it a CSS import`);
		}
		return { kind: 'line', text: head };
	}

	const block: Extract<Out, { kind: 'block' }> = { kind: 'block', head, key: null, children: [] };

	// Blocks of rules (media, supports, layer, container, keyframes, document…) nest
	// their contents through the same pass; declaration blocks (font-face, page,
	// property, counter-style…) are plain.
	const has_rules = node.children.some((c) => c.type === 'rule' || c.type === 'atrule');
	if (has_rules && node.name !== 'page') {
		if (/keyframes$/.test(node.name)) {
			for (const c of node.children) {
				if (c.type === 'rule') block.children.push(rule_block(c.selector, null, c.children, ctx));
				else if (c.type === 'comment') {
					const o = comment_out(c, ctx);
					if (o) block.children.push(o);
				}
			}
		} else {
			convert_list(node.children, block.children, ctx);
		}
	} else {
		append_children(block, node.children, ctx);
	}
	return block;
}

// --- printing -----------------------------------------------------------------

function print(nodes: Out[], depth: number, lines: string[], indent: string) {
	const pad = indent.repeat(depth);

	nodes.forEach((n, idx) => {
		// Top level: a blank line around blocks; a comment sticks to the block after it.
		const prev = nodes[idx - 1];
		if (depth === 0 && prev && (n.kind === 'block' ? prev.kind !== 'comment' : prev.kind === 'block')) lines.push('');

		switch (n.kind) {
			case 'decl':
				lines.push(pad + n.text);
				break;
			case 'line':
				lines.push(pad + n.text);
				break;
			case 'comment': {
				const body = n.text.replace(/^\*+/, (m) => (n.loud ? m : '')).replace(/\*+$/, '');
				const text_lines = body.split('\n').map((l) => l.trim());
				while (text_lines.length && text_lines[0] === '') text_lines.shift();
				while (text_lines.length && text_lines[text_lines.length - 1] === '') text_lines.pop();
				if (n.loud) {
					if (text_lines.length <= 1) lines.push(`${pad}/* ${text_lines[0] ?? ''} */`.replace('/* !', '/*!'));
					else {
						lines.push(`${pad}/*${text_lines[0].startsWith('!') ? '' : ' '}${text_lines[0]}`);
						for (const l of text_lines.slice(1)) lines.push(`${pad}${indent}${l}`);
						lines[lines.length - 1] += ' */';
					}
				} else {
					for (const l of text_lines) lines.push(`${pad}//${l ? ` ${l.replace(/^\*\s?/, '')}` : ''}`);
				}
				break;
			}
			case 'block': {
				lines.push(pad + n.head);
				if (n.children.length === 0) lines.push(`${pad}${indent}// (empty)`);
				print(n.children, depth + 1, lines, indent);
				break;
			}
		}
	});
}
