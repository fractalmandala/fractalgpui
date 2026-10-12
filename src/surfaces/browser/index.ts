import type { View } from '../../kernel/types.ts';
import { open_view } from '../../kernel/dock/dock.svelte.ts';
import Browser from './Browser.svelte';

// The Browser view: a bot's browser (Playwright, per-bot persistent profile) with status, URL, last screenshot and action log.
export default {
	id: 'browser',
	title: 'Browser',
	icon: 'compass',
	description: "A bot's browser: URL, last screenshot, action log",
	component: Browser,
	commands: [{ id: 'browser.open', title: 'Open browser', group: 'Browser', run: () => open_view('browser') }]
} satisfies View;
