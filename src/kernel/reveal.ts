import { spawnSync } from 'node:child_process';

/**
 * Reveal a path in the OS file manager (project "Open folder", About's
 * storage action). Memory-guarded like the clipboard: under
 * `FRACTALGPUI_CLIPBOARD=memory` (tests) it records and returns true without
 * spawning anything.
 */

let revealed: string | null = null;
export const last_revealed = () => revealed;

export function revealPath(path: string): boolean {
	revealed = path;
	if (process.env.FRACTALGPUI_CLIPBOARD === 'memory') return true;
	const target: [string, string[]] =
		process.platform === 'darwin'
			? ['open', [path]]
			: process.platform === 'win32'
				? ['explorer', [path]]
				: ['xdg-open', [path]];
	try {
		const r = spawnSync(target[0], target[1], { timeout: 5000 });
		return r.status === 0;
	} catch {
		return false;
	}
}
let opened: string | null = null;
export const last_opened = () => opened;

/** Open a URL in the OS browser (sign-in flows). Memory-guarded in tests. */
export function openUrl(url: string): boolean {
	opened = url;
	if (process.env.FRACTALGPUI_CLIPBOARD === 'memory') return true;
	try {
		const target: [string, string[]] =
			process.platform === 'darwin'
				? ['open', [url]]
				: process.platform === 'win32'
					? ['cmd', ['/c', 'start', url]]
					: ['xdg-open', [url]];
		const r = spawnSync(target[0], target[1], { timeout: 5000 });
		return r.status === 0;
	} catch {
		return false;
	}
}
