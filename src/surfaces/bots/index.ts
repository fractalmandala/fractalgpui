import type { View } from '../../kernel/types.ts';
import { open_view } from '../../kernel/dock/dock.svelte.ts';
import BotEditor from './BotEditor.svelte';
import Bots from './Bots.svelte';

// Bots views: the explorer (list, create) and the editor (one bot, tabbed sections, Save with a diff).
const explorer = {
	id: 'bots',
	title: 'Bots',
	icon: 'bot',
	description: 'Your bots: create, open, duplicate',
	component: Bots,
	commands: [{ id: 'bots.open', title: 'Open bots', group: 'Bots', run: () => open_view('bots') }]
} satisfies View;

const editor = {
	id: 'bot-editor',
	title: 'Bot editor',
	icon: 'sliders-horizontal',
	description: 'Edit the selected bot',
	component: BotEditor
} satisfies View;

export default [explorer, editor] satisfies View[];
