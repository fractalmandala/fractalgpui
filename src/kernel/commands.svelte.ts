/**
 * The command registry, the keymap that triggers commands, and the palette's state.
 * Everything the user can do is a `Command`; tools contribute theirs through their
 * manifest. `handle_key` is wired to `on_window_key` by the shell.
 */

import type { Command } from './types.ts';
import { keystroke, normalize, type KeyLike } from './keymap.ts';

const registry = $state<Command[]>([]);

export function register(commands: Command[]): () => void {
	for (const c of commands) {
		if (registry.some((r) => r.id === c.id)) throw new Error(`[fractalgpui] command "${c.id}" registered twice`);
	}
	registry.push(...commands);
	return () => {
		for (const c of commands) {
			const at = registry.findIndex((r) => r.id === c.id);
			if (at !== -1) registry.splice(at, 1);
		}
	};
}

export const all_commands = () => registry.filter((c) => c.enabled?.() ?? true);
export const find_command = (id: string) => registry.find((c) => c.id === id) ?? null;

export function run(id: string): boolean {
	const c = find_command(id);
	if (!c || !(c.enabled?.() ?? true)) return false;
	c.run();
	return true;
}

/** Runs the command bound to this key event, if any. */
export function handle_key(e: KeyLike): boolean {
	const stroke = keystroke(e);
	const c = all_commands().find((c) => c.keys && normalize(c.keys) === stroke);
	if (!c) return false;
	c.run();
	return true;
}

// --- fuzzy matching --------------------------------------------------------------

/** Subsequence match; contiguous runs and word starts score higher. null = no match. */
export function score(query: string, text: string): number | null {
	const q = query.toLowerCase().trim();
	if (!q) return 0;
	const t = text.toLowerCase();
	let s = 0;
	let ti = 0;
	let run_len = 0;
	for (const ch of q) {
		if (ch === ' ') continue;
		const at = t.indexOf(ch, ti);
		if (at === -1) return null;
		run_len = at === ti ? run_len + 1 : 1;
		s += run_len * 2 + (at === 0 || /[\s\-./>]/.test(t[at - 1]) ? 3 : 0) - Math.min(at - ti, 5) * 0.1;
		ti = at + 1;
	}
	return s;
}

export function search(query: string): Command[] {
	const scored: { c: Command; s: number; i: number }[] = [];
	all_commands().forEach((c, i) => {
		const s = score(query, `${c.group ? `${c.group} ` : ''}${c.title}`);
		if (s !== null) scored.push({ c, s, i });
	});
	return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
}

// --- palette -----------------------------------------------------------------------

export const palette = $state({ open: false, query: '', index: 0 });

export function open_palette() {
	palette.query = '';
	palette.index = 0;
	palette.open = true;
}

export function close_palette() {
	palette.open = false;
}

export function move_selection(delta: number) {
	const n = search(palette.query).length;
	if (n === 0) return;
	palette.index = (palette.index + delta + n) % n;
}

export function set_query(query: string) {
	palette.query = query;
	palette.index = 0;
}

/** Runs the highlighted result and closes the palette. */
export function run_selected(): boolean {
	const c = search(palette.query)[palette.index];
	close_palette();
	if (!c) return false;
	c.run();
	return true;
}
