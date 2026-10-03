/**
 * Keystrokes in GPUI's syntax: modifiers then key, dash-joined, lowercase —
 * `cmd-k`, `cmd-shift-l`, `escape`. Normalised so `Shift+Cmd+L` matches too.
 */

const ORDER = ['ctrl', 'alt', 'shift', 'cmd'] as const;
const ALIASES: Record<string, string> = { meta: 'cmd', command: 'cmd', super: 'cmd', option: 'alt', control: 'ctrl', esc: 'escape', return: 'enter' };

export function normalize(keys: string): string {
	const parts = keys.toLowerCase().split(/[-+]/).filter(Boolean).map((p) => ALIASES[p] ?? p);
	const key = parts.filter((p) => !(ORDER as readonly string[]).includes(p)).pop() ?? '';
	const mods = ORDER.filter((m) => parts.includes(m));
	return [...mods, key].join('-');
}

export interface KeyLike {
	key?: string;
	modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean; cmd?: boolean };
}

export function keystroke(e: KeyLike): string {
	const m = e.modifiers ?? {};
	const mods = ORDER.filter((k) => m[k]);
	return [...mods, ALIASES[(e.key ?? '').toLowerCase()] ?? (e.key ?? '').toLowerCase()].join('-');
}

const GLYPHS: Record<string, string> = { cmd: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃', enter: '↵', escape: 'esc' };

/** `cmd-shift-l` → `⇧⌘L` for display. */
export function pretty(keys: string): string {
	const parts = normalize(keys).split('-');
	const key = parts.pop() ?? '';
	const mods = ['ctrl', 'alt', 'shift', 'cmd'].filter((m) => parts.includes(m)).map((m) => GLYPHS[m]);
	return mods.join('') + (GLYPHS[key] ?? key.toUpperCase());
}
