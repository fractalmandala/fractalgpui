import type { Mode } from './design.svelte.ts';
import { persisted } from './storage.svelte.ts';

/** App-wide preferences. Views keep their own slots via `persisted()`; the layout is the dock's. */
export const settings = persisted('app', {
	theme: 'dark' as Mode
});

export function toggle_theme() {
	settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
}
