/**
 * Which class names the app's components use. Read from the Svelte AST, so it sees
 * `class="a b"`, `class:name={…}`, and string literals inside `class={…}`
 * expressions (`class={['row', active && 'active']}`, `class={{ active }}` keys).
 * A class name built at runtime (`'gap-' + size`) is invisible here by design:
 * write class names literally so the style check and pruning can see them.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'svelte/compiler';

type AnyNode = { type?: string; [key: string]: unknown };

function walk(node: unknown, visit: (n: AnyNode) => void) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) walk(n, visit);
		return;
	}
	const n = node as AnyNode;
	if (typeof n.type === 'string') visit(n);
	for (const key of Object.keys(n)) {
		if (key === 'parent' || key === 'metadata') continue;
		walk(n[key], visit);
	}
}

function literals(expr: unknown, out: Set<string>) {
	walk(expr, (n) => {
		if (n.type === 'Literal' && typeof n.value === 'string') for (const c of n.value.split(/\s+/)) c && out.add(c);
		if (n.type === 'TemplateElement') for (const c of String((n.value as { cooked?: string })?.cooked ?? '').split(/\s+/)) c && out.add(c);
		if (n.type === 'Property' && (n.key as AnyNode)?.type === 'Identifier') out.add(String((n.key as AnyNode).name));
	});
}

export function classes_in_svelte(source: string, out = new Set<string>()): Set<string> {
	const ast = parse(source, { modern: true });
	walk(ast.fragment, (n) => {
		if (n.type === 'ClassDirective') out.add(String(n.name));
		if (n.type === 'Attribute' && n.name === 'class') {
			const value = n.value;
			const chunks = Array.isArray(value) ? value : [value];
			for (const chunk of chunks as AnyNode[]) {
				if (chunk?.type === 'Text') for (const c of String(chunk.data).split(/\s+/)) c && out.add(c);
				else if (chunk?.type === 'ExpressionTag') literals(chunk.expression, out);
			}
		}
	});
	return out;
}

export function svelte_files(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (name === 'node_modules' || name.startsWith('.')) continue;
		if (statSync(path).isDirectory()) out.push(...svelte_files(path));
		else if (name.endsWith('.svelte')) out.push(path);
	}
	return out.sort();
}

/** class name → the files using it. */
export function used_classes(dir: string): Map<string, string[]> {
	const used = new Map<string, string[]>();
	for (const file of svelte_files(dir)) {
		for (const c of classes_in_svelte(readFileSync(file, 'utf8'))) {
			const files = used.get(c) ?? [];
			files.push(file);
			used.set(c, files);
		}
	}
	return used;
}

/** Element names the app renders (`div`, `text`, `textarea`…), components excluded. */
export function used_tags(dir: string): Set<string> {
	const tags = new Set<string>();
	for (const file of svelte_files(dir)) {
		walk(parse(readFileSync(file, 'utf8'), { modern: true }).fragment, (n) => {
			if (n.type === 'RegularElement') tags.add(String(n.name));
		});
	}
	return tags;
}

/** Type selectors in a selector: `a.primary:hover` → ['a']. */
export const selector_tags = (selector: string): string[] =>
	[...selector.replace(/\([^)]*\)|\[[^\]]*\]|"[^"]*"/g, '').matchAll(/(?:^|[\s>+~,])([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
