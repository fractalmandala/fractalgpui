import type { View } from '../../kernel/types.ts';
import { open_view } from '../../kernel/dock/dock.svelte.ts';
import Models from './Models.svelte';

// Models & providers: kept models (the only ones the picker offers), env-detected providers, keys, usage.
export default {
	id: 'models',
	title: 'Models & providers',
	icon: 'plug',
	description: 'Keep models, manage providers and keys, see usage',
	component: Models,
	commands: [{ id: 'models.open', title: 'Open models & providers', group: 'Models', run: () => open_view('models') }]
} satisfies View;
