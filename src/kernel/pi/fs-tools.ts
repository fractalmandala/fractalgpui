// Roaming read-only helpers for bots (ported from pibots tools-fs.ts): list a directory, search file contents.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'target', '.cache', 'Library']);

export function expandPath(p: string, cwd: string = homedir()): string {
	const q = p.replace(/^~(?=\/|$)/, homedir());
	return isAbsolute(q) ? q : resolve(cwd, q);
}

/** `d|-  size  name` lines, max 200 entries. */
export async function listDir(path: string, cwd?: string): Promise<string> {
	const dir = expandPath(path, cwd);
	const names = (await readdir(dir)).sort();
	const lines: string[] = [];
	for (const n of names.slice(0, 200)) {
		try {
			const s = await stat(join(dir, n));
			lines.push(`${s.isDirectory() ? 'd' : '-'} ${String(s.size).padStart(10)} ${n}`);
		} catch {
			lines.push(`? ${''.padStart(10)} ${n}`);
		}
	}
	if (names.length > 200) lines.push(`[${names.length - 200} more entries not shown]`);
	return `${dir}\n${lines.join('\n')}`;
}

/** Regex search under a folder (or one file); max 100 matches, files up to 1MB, binaries skipped. */
export async function searchFiles(pattern: string, path = '.', ignoreCase = false, cwd?: string): Promise<string> {
	const root = expandPath(path, cwd);
	const re = new RegExp(pattern, ignoreCase ? 'i' : '');
	const hits: string[] = [];
	let scanned = 0;
	const scan = (p: string, text: string) => {
		scanned++;
		const ls = text.split('\n');
		for (let i = 0; i < ls.length && hits.length < 100; i++) if (re.test(ls[i]!)) hits.push(`${p}:${i + 1}: ${ls[i]!.slice(0, 200)}`);
	};
	const walk = async (dir: string, depth: number): Promise<void> => {
		if (hits.length >= 100 || depth > 12) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			if (hits.length >= 100) return;
			const p = join(dir, e.name);
			if (e.isDirectory()) {
				if (!SKIP.has(e.name)) await walk(p, depth + 1);
			} else if (e.isFile()) {
				try {
					if ((await stat(p)).size > 1_000_000) continue;
					const text = await readFile(p, 'utf8');
					if (!text.includes('\0')) scan(p, text);
				} catch {
					/* unreadable */
				}
			}
		}
	};
	if ((await stat(root)).isFile()) scan(root, await readFile(root, 'utf8'));
	else await walk(root, 0);
	return hits.length ? `${hits.join('\n')}\n[${hits.length} matches, ${scanned} files scanned]` : `no matches (${scanned} files scanned)`;
}
