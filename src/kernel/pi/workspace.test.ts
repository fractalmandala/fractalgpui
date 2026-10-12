import { describe, expect, test, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invalidateWorkspace, workspaceInfo } from './workspace.ts';

const root = mkdtempSync(join(tmpdir(), 'fractalgpui-workspace-'));
afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

function git(args: string[], cwd: string): void {
	const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15000 });
	if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

/** A committed repo on a known branch. */
function makeRepo(name: string, branch: string): string {
	const dir = join(root, name);
	mkdirSync(dir, { recursive: true });
	git(['init', '-b', branch], dir);
	git(['config', 'user.email', 'test@fractalgpui.dev'], dir);
	git(['config', 'user.name', 'fractalgpui test'], dir);
	writeFileSync(join(dir, 'file.txt'), 'hello\n');
	git(['add', '-A'], dir);
	git(['commit', '-m', 'init'], dir);
	return dir;
}

describe('workspaceInfo', () => {
	test('a repo reports its branch and one worktree', () => {
		const dir = makeRepo('repo', 'testbranch');
		const info = workspaceInfo(dir);
		expect(info.branch).toBe('testbranch');
		expect(info.worktrees).toBe(1);
	});

	test('a linked worktree raises the count', () => {
		const dir = makeRepo('multi', 'mainline');
		git(['worktree', 'add', join(dir, 'linked'), '-b', 'second'], dir);
		invalidateWorkspace(dir);
		expect(workspaceInfo(dir).worktrees).toBe(2);
	});

	test('a plain folder has no branch and no worktrees', () => {
		const dir = join(root, 'plain');
		mkdirSync(dir, { recursive: true });
		const info = workspaceInfo(dir);
		expect(info.branch).toBeNull();
		expect(info.worktrees).toBe(0);
	});

	test('a missing folder never throws', () => {
		const info = workspaceInfo(join(root, 'no-such-dir'));
		expect(info.branch).toBeNull();
		expect(info.worktrees).toBe(0);
	});

	test('results cache briefly and invalidate drops them', () => {
		const dir = makeRepo('cached', 'first');
		const a = workspaceInfo(dir);
		const b = workspaceInfo(dir);
		expect(b).toBe(a);
		git(['checkout', '-b', 'second'], dir);
		// Still cached: the real branch changed but the cached answer stands.
		expect(workspaceInfo(dir).branch).toBe('first');
		invalidateWorkspace(dir);
		expect(workspaceInfo(dir).branch).toBe('second');
	});
});
