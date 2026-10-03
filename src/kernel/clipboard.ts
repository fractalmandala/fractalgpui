/**
 * Copy text to the OS clipboard. gpuix 0.7 exposes no clipboard to JS (its text
 * fields handle ⌘C/⌘V natively), so this shells out: `pbcopy` on macOS, `clip` on
 * Windows, `wl-copy`/`xclip` on Linux. `FRACTALGPUI_CLIPBOARD=memory` keeps it in
 * process (tests), readable through `last_copied()`.
 */

import { spawnSync } from 'node:child_process';

let memory: string | null = null;
export const last_copied = () => memory;

function candidates(): [string, string[]][] {
	switch (process.platform) {
		case 'darwin':
			return [['pbcopy', []]];
		case 'win32':
			return [['clip', []]];
		default:
			return [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]];
	}
}

export function copy_text(text: string): boolean {
	memory = text;
	if (process.env.FRACTALGPUI_CLIPBOARD === 'memory') return true;
	for (const [cmd, args] of candidates()) {
		const r = spawnSync(cmd, args, { input: text, timeout: 3000 });
		if (r.status === 0) return true;
	}
	return false;
}
