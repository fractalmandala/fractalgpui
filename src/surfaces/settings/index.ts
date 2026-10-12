import type { Surface } from '../../kernel/types.ts';
import Settings from './Settings.svelte';
import SettingsSidebar from './SettingsSidebar.svelte';
import { openSettings } from './pages.svelte.ts';

// Settings surface: app pages in the main area, the page list left.
export default {
	id: 'settings',
	title: 'Settings',
	icon: 'settings',
	description: 'App settings and model providers',
	component: Settings,
	sections: { 'sidebar-left': { body: SettingsSidebar } },
	commands: [
		{ id: 'settings.open', title: 'Open settings', group: 'App', keys: 'cmd-,', run: () => openSettings() },
		{ id: 'settings.models', title: 'Settings: model configuration', group: 'App', run: () => openSettings('models') }
	]
} satisfies Surface;
