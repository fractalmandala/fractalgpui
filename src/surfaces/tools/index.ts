import { open_view } from '../../kernel/dock/dock.svelte.ts';
import type { View } from '../../kernel/types.ts';
import { TOOLS } from './registry.ts';
import { active_tool, select_tool } from './state.svelte.ts';
import Tools from './Tools.svelte';

// One view hosting every tool (src/surfaces/tools/<id>/, see types.ts).
export default {
	id: 'tools',
	title: 'Tools',
	icon: 'wand-sparkles',
	description: TOOLS.map((t) => t.title).join(' · '),
	component: Tools,
	load: () => select_tool(active_tool().id),
	commands: TOOLS.flatMap((t) =>
		(t.commands ?? []).map((c) => ({
			...c,
			group: c.group ?? t.title,
			run: () => {
				open_view('tools');
				select_tool(t.id);
				c.run();
			}
		}))
	)
} satisfies View;
