import { describe, expect, test, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';

const ctx = () => BACKGROUND_CONTEXT;
const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-env-'));
afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** Slice 3 smoke: the env a session's tools will run in — cwd-bound files and shell. */
describe('NodeExecutionEnv', () => {
	test('write, read, and exec round-trip inside cwd', async () => {
		const env = new NodeExecutionEnv({ cwd: dir, shellEnv: process.env });
		try {
			const written = await env.writeFile('note.txt', 'hello env', ctx());
			expect(written.ok).toBe(true);
			const read = await env.readTextFile('note.txt', ctx());
			expect(read.ok && read.value).toBe('hello env');
			const run = await env.exec('pwd', undefined, ctx());
			expect(run.ok).toBe(true);
			if (run.ok) expect(run.value.exitCode).toBe(0);
		} finally {
			await env.cleanup(ctx());
		}
	});

	test('missing files fail as ordinary errors, not throws', async () => {
		const env = new NodeExecutionEnv({ cwd: dir, shellEnv: process.env });
		try {
			const read = await env.readTextFile('nope-missing.txt', ctx());
			expect(read.ok).toBe(false);
		} finally {
			await env.cleanup(ctx());
		}
	});
});
