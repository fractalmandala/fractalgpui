/**
 * The tool registry and the app-level commands. `install()` runs once per process
 * (the shell calls it on mount; a hot remount finds it already installed).
 */

import { TOOLS } from '../tools/index.ts';
import { close_palette, open_palette, palette, register } from './commands.svelte.ts';
import { settings, switch_to, toggle_theme } from './settings.svelte.ts';
import type { Command, ToolManifest } from './types.ts';

export const tools: readonly ToolManifest[] = TOOLS;

export const active_tool = (): ToolManifest => tools.find((t) => t.id === settings.activeTool) ?? tools[0];

let installed = false;

export function install() {
	if (installed) return;
	installed = true;

	const app: Command[] = [
		{ id: 'palette.toggle', title: 'Command palette', group: 'App', keys: 'cmd-k', run: () => (palette.open ? close_palette() : open_palette()) },
		{ id: 'palette.close', title: 'Close command palette', group: 'App', keys: 'escape', run: close_palette, enabled: () => palette.open },
		{ id: 'theme.toggle', title: 'Toggle light / dark theme', group: 'App', keys: 'cmd-shift-l', run: toggle_theme }
	];

	const navigation: Command[] = tools.map((t, i) => ({
		id: `tool.open.${t.id}`,
		title: `Go to ${t.title}`,
		group: 'Tools',
		keys: i < 9 ? `cmd-${i + 1}` : undefined,
		run: () => switch_to(t.id)
	}));

	const contributed = tools.flatMap((t) => (t.commands ?? []).map((c) => ({ ...c, group: c.group ?? t.title })));

	register([...app, ...navigation, ...contributed]);
}
