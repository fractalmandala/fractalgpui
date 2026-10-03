/**
 * A small line diff (LCS) and a unified-diff writer, enough for the converter's
 * round-trip view. Inputs are stylesheets, so O(n·m) is fine; past `LIMIT` lines a
 * side the diff degrades to "replace everything" rather than allocating a huge table.
 */

export type DiffOp = { op: ' ' | '-' | '+'; line: string };

const LIMIT = 3000;

export function line_diff(a: string[], b: string[]): DiffOp[] {
	if (a.length > LIMIT || b.length > LIMIT) {
		return [...a.map((line) => ({ op: '-' as const, line })), ...b.map((line) => ({ op: '+' as const, line }))];
	}
	const n = a.length;
	const m = b.length;
	// lcs[i][j] = LCS length of a[i..] and b[j..]
	const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}
	const out: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) out.push({ op: ' ', line: a[i++] }), j++;
		else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: '-', line: a[i++] });
		else out.push({ op: '+', line: b[j++] });
	}
	while (i < n) out.push({ op: '-', line: a[i++] });
	while (j < m) out.push({ op: '+', line: b[j++] });
	return out;
}

export interface Unified {
	/** A unified diff (`---`/`+++` header, one hunk with full context); empty when equal. */
	patch: string;
	added: number;
	removed: number;
}

const lines_of = (s: string) => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));

export function unified(before: string, after: string, names = { from: 'a', to: 'b' }): Unified {
	const a = lines_of(before);
	const b = lines_of(after);
	const ops = line_diff(a, b);
	const added = ops.filter((o) => o.op === '+').length;
	const removed = ops.filter((o) => o.op === '-').length;
	if (!added && !removed) return { patch: '', added, removed };
	const head = `--- ${names.from}\n+++ ${names.to}\n@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@\n`;
	return { patch: head + ops.map((o) => o.op + o.line).join('\n') + '\n', added, removed };
}
