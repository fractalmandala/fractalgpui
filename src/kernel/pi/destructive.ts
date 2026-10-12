// Destructive-action detection, ported from pibots' policy.ts. The approval itself reuses fractalgpui's durable approvals
// (tools.ts); this module only decides WHICH calls are destructive. There is deliberately no path restriction here.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export interface Destructive {
	reason: string;
}

const BASH_PATTERNS: Array<[RegExp, string]> = [
	[/(^|[\s;&|`(])rm\s/, "deletes files (rm)"],
	[/(^|[\s;&|`(])(rmdir|unlink|shred)\b/, "deletes files"],
	[/(^|[\s;&|`(])(truncate|dd|mkfs\S*|diskutil|fdisk)\b/, "can destroy data"],
	[/(^|[\s;&|`(])mv\s/, "moves/overwrites files (mv)"],
	[/(^|[\s;&|`(])sudo\b/, "runs as root"],
	[/\bfind\b[^|;&]*-delete\b/, "deletes files (find -delete)"],
	[/\bgit\s+(clean|reset\s+--hard|checkout\s+--|push\s+(-f|--force))/, "discards git work"],
	[/(^|[^>&0-9])>(?!>|&|\s*\/dev\/null)\s*[^\s|&>]/, "overwrites a file via redirection"],
	[/\|\s*(sh|bash|zsh)\b/, "pipes into a shell"],
];

/** Classify a tool call. Pure apart from an existence check for `write`. */
export function classifyDestructive(name: string, args: Record<string, unknown>, cwd: string): Destructive | undefined {
	if (name === "write") {
		const p = String(args.path ?? "");
		const abs = isAbsolute(p) ? p : resolve(cwd, p.replace(/^~(?=\/|$)/, homedir()));
		if (existsSync(abs)) return { reason: `overwrites existing file ${abs}` };
		return undefined;
	}
	if (name === "bash") {
		const cmd = String(args.command ?? "");
		for (const [re, why] of BASH_PATTERNS) if (re.test(cmd)) return { reason: why };
	}
	return undefined;
}
