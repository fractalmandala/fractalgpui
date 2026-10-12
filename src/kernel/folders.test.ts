import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDirInput, dirName, listDirs, parentDir, segments } from './folders.ts';

const make = () => {
	const root = mkdtempSync(join(tmpdir(), 'fractalgpui-folders-'));
	mkdirSync(join(root, 'beta'));
	mkdirSync(join(root, 'alpha'));
	mkdirSync(join(root, '.hidden'));
	writeFileSync(join(root, 'file.txt'), 'x');
	mkdirSync(join(root, 'beta', 'nested'));
	return root;
};

describe('listDirs', () => {
	test('lists subdirectories alphabetically, skipping dotfiles and files', () => {
		const root = make();
		try {
			const { entries, error } = listDirs(root);
			expect(error).toBe(null);
			expect(entries.map((e) => e.name)).toEqual(['alpha', 'beta']);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('missing paths report instead of throwing', () => {
		const { entries, error } = listDirs(join(tmpdir(), 'fractalgpui-no-such-dir-xyz'));
		expect(entries).toEqual([]);
		expect(typeof error).toBe('string');
	});
});

describe('paths', () => {
	test('parent/segments/dirName round-trip', () => {
		expect(parentDir('/a/b/c')).toBe('/a/b');
		expect(dirName('/a/b/c')).toBe('c');
		expect(segments('/a/b').map((s) => s.label)).toEqual(['/', 'a', 'b']);
		expect(segments('/a/b')[2]?.path).toBe('/a/b');
	});
});

describe('checkDirInput', () => {
	test('accepts a real directory, rejects the rest with reasons', () => {
		const root = make();
		try {
			expect(checkDirInput(root).error).toBe(null);
			expect(checkDirInput(join(root, 'file.txt')).error).toContain('not a directory');
			expect(checkDirInput(join(root, 'missing')).error).toContain('does not exist');
			expect(checkDirInput('relative/path').error).toContain('absolute');
			expect(checkDirInput('   ').error).toContain('Type a folder path');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
