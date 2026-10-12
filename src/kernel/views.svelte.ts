/**
 * The view registry and the app-level commands. `install()` runs once per process
 * (the shell calls it on mount; a hot remount finds it already installed).
 */

import { reset_style } from './style.svelte.ts';
import { VIEWS } from '../surfaces/index.ts';
import { close_palette, open_palette, palette, register } from './commands.svelte.ts';
import { design } from './design.svelte.ts';
import { cycle_tab, dock, focused_group, init_dock, open_view, reset_layout, close_view_leaf, toggle_zoom, ui } from './dock/dock.svelte.ts';
import { flash } from './status.svelte.ts';
import { toggle_theme } from './settings.svelte.ts';
import type { Command, View } from './types.ts';

export const views: readonly View[] = VIEWS;
export const view_of = (id: string): View | undefined => views.find((v) => v.id === id);

const loaded = new Set<string>();

/** Calls the view's `load()` the first time it is shown. */
export function ensure_loaded(view: View) {
	if (!view.load || loaded.has(view.id)) return;
	loaded.add(view.id);
	void view.load();
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
	init_dock((id) => !!view_of(id));

	const close_active = () => {
		const g = focused_group();
		if (g?.active) close_view_leaf(g.active);
	};

	const app: Command[] = [
		{ id: 'palette.toggle', title: 'Command palette', group: 'App', keys: 'cmd-k', run: () => (palette.open ? close_palette() : open_palette()) },
		{ id: 'palette.close', title: 'Close command palette', group: 'App', keys: 'escape', run: close_palette, enabled: () => palette.open },
		{ id: 'theme.toggle', title: 'Toggle light / dark theme', group: 'App', keys: 'cmd-shift-l', run: toggle_theme },
		{ id: 'style.reset', title: 'Reset style to defaults', group: 'Style', run: reset_style },
		{ id: 'diagnostics.styles', title: 'Show style diagnostics', group: 'App', run: show_style_diagnostics },
		{ id: 'dock.reset', title: 'Reset layout', group: 'Layout', run: reset_layout },
		{ id: 'dock.zoom', title: 'Zoom pane (toggle)', group: 'Layout', keys: 'cmd-shift-enter', run: toggle_zoom },
		{ id: 'dock.close', title: 'Close tab', group: 'Layout', keys: 'cmd-w', run: close_active },
		{ id: 'tabs.next', title: 'Next tab', group: 'Layout', keys: 'ctrl-tab', run: () => cycle_tab(1) },
		{ id: 'tabs.previous', title: 'Previous tab', group: 'Layout', keys: 'ctrl-shift-tab', run: () => cycle_tab(-1) },
		{ id: 'drag.cancel', title: 'Cancel tab drag', group: 'Layout', keys: 'escape', run: () => (ui.drag = ''), enabled: () => !!ui.drag }
	];

	const navigation: Command[] = views.map((v, i) => ({
		id: `view.open.${v.id}`,
		title: `Open ${v.title}`,
		group: 'Views',
		keys: i < 9 ? `cmd-${i + 1}` : undefined,
		run: () => open_view(v.id)
	}));

	const contributed = views.flatMap((v) => (v.commands ?? []).map((c) => ({ ...c, group: c.group ?? v.title })));

	register([...app, ...navigation, ...contributed]);
}

export { dock };
