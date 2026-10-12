import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allocatedBytes, measureDisk } from './disk.ts';
import { ensureBotFolders } from './paths.ts';

test('measureDisk counts allocated bytes per part', () => {
	const root = mkdtempSync(join(tmpdir(), 'disk-'));
	const p = ensureBotFolders('bot_test', root);
	writeFileSync(join(p.media, 'a.bin'), Buffer.alloc(10_000, 1));
	writeFileSync(p.audit, 'x\n');
	const d = measureDisk(p);
	expect(d.media).toBeGreaterThanOrEqual(10_000);
	expect(d.audit).toBeGreaterThan(0);
	expect(d.total).toBe(d.audit + d.memory + d.media + d.browserProfile);
	expect(d.overBudget).toEqual([]);
	expect(allocatedBytes(join(root, 'missing'))).toBe(0);
});
