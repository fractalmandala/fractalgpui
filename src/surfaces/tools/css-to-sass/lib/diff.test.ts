import { describe, expect, test } from 'bun:test';
import { line_diff, unified } from './diff.ts';

describe('diff', () => {
	test('equal inputs make no patch', () => {
		expect(unified('a\nb\n', 'a\nb\n')).toEqual({ patch: '', added: 0, removed: 0 });
	});
	test('a changed line is one removal and one addition, with context', () => {
		const u = unified('a\nb\nc\n', 'a\nB\nc\n', { from: 'x', to: 'y' });
		expect(u.added).toBe(1);
		expect(u.removed).toBe(1);
		expect(u.patch).toBe('--- x\n+++ y\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n');
	});
	test('pure insertions and deletions', () => {
		expect(line_diff(['a'], ['a', 'b']).map((o) => o.op)).toEqual([' ', '+']);
		expect(line_diff(['a', 'b'], ['b']).map((o) => o.op)).toEqual(['-', ' ']);
		expect(unified('', 'x\n').patch).toContain('@@ -0,0 +1,1 @@');
	});
});
