import { switch_to } from '../../kernel/settings.svelte.ts';
import type { Surface } from '../../kernel/types.ts';
import { TOOLS } from './registry.ts';
import Sidebar from './Sidebar.svelte';
import { active_tool, select_tool } from './state.svelte.ts';
import Toolbar from './Toolbar.svelte';
import Tools from './Tools.svelte';

// One surface hosting every tool (src/surfaces/tools/<id>/, see types.ts).
export default {
	id: 'tools',
	title: 'Tools',
	icon: 'wand-sparkles',
	description: TOOLS.map((t) => t.title).join(' · '),
	component: Tools,
	toolbar: Toolbar,
	sections: { 'sidebar-left': { body: Sidebar } },
	tabs: {
		list: () => active_tool().tabs?.list() ?? [],
		value: () => active_tool().tabs?.value() ?? '',
		select: (id) => active_tool().tabs?.select(id)
	},
	load: () => select_tool(active_tool().id),
	commands: TOOLS.flatMap((t) =>
		(t.commands ?? []).map((c) => ({
			...c,
			group: c.group ?? t.title,
			run: () => {
				switch_to('tools');
				select_tool(t.id);
				c.run();
			}
		}))
	)
} satisfies Surface;
