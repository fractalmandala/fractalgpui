import { spawnSync } from 'node:child_process';

/**
 * Workspace context for the composer's context row (§2.5) and project rows
 * (§1.20): the live git branch and the worktree count of a folder. Read on
 * selection and cached briefly — never on the render path. Never throws, never
 * writes: a folder the app cannot read simply has no branch.
 */

export interface WorkspaceInfo {
	path: string;
	/** Current branch, or null when the folder is not on a branch. */
	branch: string | null;
	/** Worktrees `git` reports: 1 for a lone repo, 0 when not a repo. */
	worktrees: number;
}

const TTL_MS = 30000;
const cache = new Map<string, { at: number; info: WorkspaceInfo }>();

function git(args: string[], cwd: string): string | null {
	try {
		const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
		if (r.status !== 0) return null;
		return (r.stdout as string).trim();
	} catch {
		return null;
	}
}

export function workspaceInfo(path: string, now: number = Date.now()): WorkspaceInfo {
	const hit = cache.get(path);
	if (hit && now - hit.at < TTL_MS) return hit.info;
	const raw = git(['rev-parse', '--abbrev-ref', 'HEAD'], path);
	// A detached HEAD is not a branch; show nothing rather than "HEAD".
	const branch = raw === null || raw === 'HEAD' ? null : raw;
	let worktrees = 0;
	if (branch !== null) {
		const list = git(['worktree', 'list', '--porcelain'], path);
		worktrees = list ? list.split('\n').filter((l) => l.startsWith('worktree ')).length : 1;
	}
	const info: WorkspaceInfo = { path, branch, worktrees };
	cache.set(path, { at: now, info });
	return info;
}

/** Forget cached info — after a project moves, or between tests. */
export function invalidateWorkspace(path?: string): void {
	if (path === undefined) cache.clear();
	else cache.delete(path);
}
