import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listDir, searchFiles } from './fs-tools.ts';

test('listDir and searchFiles', async () => {
	const root = mkdtempSync(join(tmpdir(), 'fst-'));
	writeFileSync(join(root, 'a.txt'), 'hello\nworld needle\n');
	mkdirSync(join(root, 'node_modules'));
	writeFileSync(join(root, 'node_modules', 'b.txt'), 'needle');
	const l = await listDir(root);
	expect(l).toContain('a.txt');
	expect(l).toContain('d ');
	const s = await searchFiles('NEEDLE', '.', true, root);
	expect(s).toContain('a.txt:2:');
	expect(s).not.toContain('node_modules');
	expect(await searchFiles('zzz', root)).toContain('no matches');
});
