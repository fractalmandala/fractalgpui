/** Printing AST nodes back to source, the only place strings are produced. */

import _generate from '@babel/generator';
import * as t from '@babel/types';

// Babel ships these as interop default exports.
const generate = ((_generate as unknown as { default?: typeof _generate }).default ?? _generate) as typeof _generate;

/** Multi-line, for script statements. */
export const gen = (node: t.Node): string => generate(node, { jsescOption: { minimal: true } }).code;

/** One line, for template expressions and attribute values. */
export const gen_inline = (node: t.Node): string =>
	generate(node, { concise: true, jsescOption: { minimal: true } })
		.code.replace(/;\s*$/, '')
		.trim();

/** A pattern with its TypeScript annotations removed (each-block items, @const). */
export function gen_pattern(node: t.Node): string {
	const clone = t.cloneNode(node, true);
	strip_annotations(clone);
	return gen_inline(clone);
}

function strip_annotations(node: t.Node) {
	if ('typeAnnotation' in node && !t.isTSAsExpression(node) && !t.isTSSatisfiesExpression(node) && !t.isTSTypeAnnotation(node)) (node as { typeAnnotation?: unknown }).typeAnnotation = null;
	if ('optional' in node && t.isIdentifier(node)) node.optional = false;
	for (const k of t.VISITOR_KEYS[node.type] ?? []) {
		const child = (node as unknown as Record<string, unknown>)[k];
		if (Array.isArray(child)) child.forEach((c) => c && typeof c === 'object' && 'type' in c && strip_annotations(c as t.Node));
		else if (child && typeof child === 'object' && 'type' in child) strip_annotations(child as t.Node);
	}
}
