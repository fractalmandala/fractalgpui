/**
 * The tool registry and the app-level commands. `install()` runs once per process
 * (the shell calls it on mount; a hot remount finds it already installed).
 */

import { reset_style } from './style.svelte.ts';
import { SURFACES } from '../surfaces/index.ts';
import { close_palette, open_palette, palette, register } from './commands.svelte.ts';
import { design } from './design.svelte.ts';
import { toggle, toggle_all } from './layout.svelte.ts';
import { flash } from './status.svelte.ts';
import { settings, switch_to, toggle_theme } from './settings.svelte.ts';
import type { Command, Surface } from './types.ts';

export const surfaces: readonly Surface[] = SURFACES;

export const active_surface = (): Surface => surfaces.find((t) => t.id === settings.activeSurface) ?? surfaces[0];

/** Moves the active surface's tab selection by `delta`, wrapping. */
export function cycle_tab(delta: number) {
	const tabs = active_surface().tabs;
	if (!tabs) return;
	const list = tabs.list();
	if (list.length === 0) return;
	const at = Math.max(0, list.findIndex((t) => t.id === tabs.value()));
	tabs.select(list[(at + delta + list.length) % list.length].id);
}

const loaded = new Set<string>();

/** Calls the surface's `load()` the first time it is shown. */
export function ensure_loaded(surface: Surface) {
	if (!surface.load || loaded.has(surface.id)) return;
	loaded.add(surface.id);
	void surface.load();
}

/** The last style build's warnings, flashed in the status bar. */
export function show_style_diagnostics() {
	const r = design.report;
	if (!r) return flash('No style build yet', 'info');
	const head = `${r.registered} GPUI rules from fractalstyler (${r.mode}); ${r.losses} declarations dropped`;
	flash(r.warnings.length ? `${head} · ${r.warnings.join(' · ')}` : head, r.warnings.length ? 'danger' : 'info', 8000);
}

let installed = false;

export function install() {
	if (installed) return;
	installed = true;

	const app: Command[] = [
		{ id: 'palette.toggle', title: 'Command palette', group: 'App', keys: 'cmd-k', run: () => (palette.open ? close_palette() : open_palette()) },
		{ id: 'palette.close', title: 'Close command palette', group: 'App', keys: 'escape', run: close_palette, enabled: () => palette.open },
		{ id: 'theme.toggle', title: 'Toggle light / dark theme', group: 'App', keys: 'cmd-shift-l', run: toggle_theme },
		{ id: 'layout.sidebar-left', title: 'Toggle left sidebar', group: 'View', keys: 'cmd-b', run: () => toggle('sidebar-left', active_surface()) },
		{ id: 'layout.sidebar-panel', title: 'Toggle sidebar panel', group: 'View', keys: 'cmd-j', run: () => toggle('sidebar-panel', active_surface()) },
		{ id: 'layout.sidebar-right', title: 'Toggle right sidebar', group: 'View', keys: 'cmd-i', run: () => toggle('sidebar-right', active_surface()) },
		{ id: 'layout.all', title: 'Toggle all panels', group: 'View', keys: 'cmd-\\', run: () => toggle_all(active_surface()) },
		{ id: 'style.reset', title: 'Reset style to defaults', group: 'Style', run: reset_style },
		{ id: 'diagnostics.styles', title: 'Show style diagnostics', group: 'App', run: show_style_diagnostics },
		{ id: 'tabs.next', title: 'Next tab', group: 'View', keys: 'ctrl-tab', run: () => cycle_tab(1), enabled: () => !!active_surface().tabs },
		{ id: 'tabs.previous', title: 'Previous tab', group: 'View', keys: 'ctrl-shift-tab', run: () => cycle_tab(-1), enabled: () => !!active_surface().tabs }
	];

	const navigation: Command[] = surfaces.map((t, i) => ({
		id: `tool.open.${t.id}`,
		title: `Go to ${t.title}`,
		group: 'Tools',
		keys: i < 9 ? `cmd-${i + 1}` : undefined,
		run: () => switch_to(t.id)
	}));

	const contributed = surfaces.flatMap((t) => (t.commands ?? []).map((c) => ({ ...c, group: c.group ?? t.title })));

	register([...app, ...navigation, ...contributed]);
}
