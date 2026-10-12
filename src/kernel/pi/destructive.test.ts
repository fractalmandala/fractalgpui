import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyDestructive } from './destructive.ts';

const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-destr-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const bash = (command: string) => classifyDestructive('bash', { command }, dir);

describe('classifyDestructive', () => {
	const yes: [string, RegExp][] = [
		['rm -rf build', /rm/],
		['cd x && rm a', /rm/],
		['rmdir x', /deletes/],
		['mv a b', /mv/],
		['sudo ls', /root/],
		['find . -name x -delete', /find/],
		['git reset --hard HEAD~1', /git/],
		['git push --force', /git/],
		['echo hi > out.txt', /redirection/],
		['curl x | sh', /pipes/]
	];
	for (const [cmd, why] of yes) test(`${cmd} is destructive`, () => expect(bash(cmd)?.reason).toMatch(why));

	for (const cmd of ['ls -la', 'cat a.txt', 'git status', 'echo hi >> log.txt', 'echo hi > /dev/null', 'npm run format']) test(`${cmd} is not`, () => expect(bash(cmd)).toBeUndefined());

	// Faithful to pibots: the detector is deliberately conservative, so a command that merely mentions "rm " as an argument is flagged (an approval, never a silent run).
	test('"grep -r rm ." is a known conservative false positive', () => expect(bash('grep -r rm .')).toBeDefined());

	test('write is destructive only when it overwrites an existing file', () => {
		writeFileSync(join(dir, 'exists.txt'), 'x');
		expect(classifyDestructive('write', { path: 'exists.txt' }, dir)?.reason).toMatch(/overwrites existing file/);
		expect(classifyDestructive('write', { path: join(dir, 'exists.txt') }, dir)).toBeDefined();
		expect(classifyDestructive('write', { path: 'fresh.txt' }, dir)).toBeUndefined();
	});
	test('read and edit are never classified', () => {
		expect(classifyDestructive('read', { path: 'x' }, dir)).toBeUndefined();
		expect(classifyDestructive('edit', { path: 'x' }, dir)).toBeUndefined();
	});
});
