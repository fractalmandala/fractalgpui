import type { View } from '../../kernel/types.ts';
import Settings from './Settings.svelte';
import { openSettings } from './pages.svelte.ts';

// Settings view: the page list on the left of the pane, the page beside it.
export default {
	id: 'settings',
	title: 'Settings',
	icon: 'settings',
	description: 'App settings and model providers',
	component: Settings,
	commands: [
		{ id: 'settings.open', title: 'Open settings', group: 'App', keys: 'cmd-,', run: () => openSettings() },
		{ id: 'settings.models', title: 'Settings: model configuration', group: 'App', run: () => openSettings('models') }
	]
} satisfies View;
