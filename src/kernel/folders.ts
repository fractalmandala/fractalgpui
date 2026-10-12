import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Folder-picker kernel (in-app browser behind the `pickFolder()`
 * indirection — the native `NSOpenPanel` call in `remorses/gpuix#82` swaps
 * in here without touching callers). Pure `node:fs`, no UI framework, so
 * it unit-tests under plain `bun test`.
 */
export interface DirEntry {
	name: string;
	path: string;
}

/** Hidden names never shown (dev folders are full of dotfile noise). */
const HIDDEN = /^\./;

/** Subdirectories of `dir`, alphabetical, dotfiles skipped. */
export function listDirs(dir: string): { entries: DirEntry[]; error: string | null } {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return { entries: [], error: `Could not read ${dir}.` };
	}
	const out: DirEntry[] = [];
	for (const name of names) {
		if (HIDDEN.test(name)) continue;
		const path = join(dir, name);
		try {
			if (statSync(path).isDirectory()) out.push({ name, path });
		} catch {
			// Vanished or unreadable mid-scan: skip, never fail the list.
		}
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return { entries: out, error: null };
}

export const homeDir = (): string => homedir();

export const parentDir = (dir: string): string => dirname(resolve(dir));

/** Display name for a directory (root keeps its slash). */
export function dirName(dir: string): string {
	const base = basename(resolve(dir));
	return base || resolve(dir);
}

/** Breadcrumb segments from root to `dir` (for the picker row). */
export function segments(dir: string): { label: string; path: string }[] {
	const abs = resolve(dir);
	const parts = abs.split('/').filter(Boolean);
	const out: { label: string; path: string }[] = [{ label: '/', path: '/' }];
	let acc = '';
	for (const part of parts) {
		acc += `/${part}`;
		out.push({ label: part, path: acc });
	}
	return out;
}

/** Validate a typed candidate as a working folder needs: absolute, a directory. */
export function checkDirInput(raw: string): { path: string; error: string | null } {
	const clean = raw.trim();
	if (!clean) return { path: '', error: 'Type a folder path or browse to one.' };
	if (!isAbsolute(clean)) return { path: '', error: 'The path must be absolute.' };
	try {
		if (!statSync(clean).isDirectory()) return { path: '', error: 'That path is not a directory.' };
	} catch {
		return { path: '', error: 'That folder does not exist.' };
	}
	return { path: resolve(clean), error: null };
}
