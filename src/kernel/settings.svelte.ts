import { emit } from './bus.ts';
import type { Mode } from './design.svelte.ts';
import { persisted } from './storage.svelte.ts';

/** App-wide preferences. Tools keep their own slots via `persisted()`. */
export const settings = persisted('app', {
	theme: 'dark' as Mode,
	activeSurface: 'home'
});

export function toggle_theme() {
	settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
}

/** Shows a tool; the shell falls back to the first tool for an unknown id. */
export function switch_to(id: string) {
	const from = settings.activeSurface;
	settings.activeSurface = id;
	if (from !== id) emit('surface:switch', { from, to: id });
}
