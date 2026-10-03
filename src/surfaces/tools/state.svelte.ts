/** Which tool the Tools surface shows. Persisted, so it survives switching and restarts. */

import { persisted } from '../../kernel/storage.svelte.ts';
import { TOOLS } from './registry.ts';
import type { Tool } from './types.ts';

export const tools_state = persisted('surface.tools', { active: TOOLS[0].id });

export const active_tool = (): Tool => TOOLS.find((t) => t.id === tools_state.active) ?? TOOLS[0];

const loaded = new Set<string>();

export function select_tool(id: string) {
	const tool = TOOLS.find((t) => t.id === id);
	if (!tool) return;
	tools_state.active = id;
	if (tool.load && !loaded.has(id)) {
		loaded.add(id);
		void tool.load();
	}
}
