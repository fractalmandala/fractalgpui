import { persisted } from '../../kernel/storage.svelte.ts';

/**
 * Chats list chrome, persisted across restarts: which groups (a bot id, or `plain`) are collapsed and whether
 * the Archived group is open. Selection itself lives in `session.svelte.ts` (`active`). Groups start expanded.
 */
export const PLAIN = 'plain';

export const sidebarUi = persisted('pi-history-ui', {
	collapsed: {} as Record<string, boolean>,
	showArchived: false
});

export function isCollapsed(group: string): boolean {
	return sidebarUi.collapsed[group] === true;
}

export function setCollapsed(group: string, collapsed: boolean) {
	const next = { ...sidebarUi.collapsed };
	if (collapsed) next[group] = true;
	else delete next[group];
	sidebarUi.collapsed = next;
}
