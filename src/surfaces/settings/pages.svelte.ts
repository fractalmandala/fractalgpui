import { persisted } from '../../kernel/storage.svelte.ts';
import { switch_to } from '../../kernel/settings.svelte.ts';

export type SettingsPage = 'general' | 'models' | 'shortcuts' | 'about';

/** The selected Settings page; persists across opens. */
export const settingsPage = persisted('pi-settings-page', { page: 'models' as SettingsPage });

/** Open Settings on a page (or the last selected one) via the surface switch. */
export function openSettings(page?: SettingsPage) {
	if (page) settingsPage.page = page;
	switch_to('settings');
}
