import { persisted } from '../../kernel/storage.svelte.ts';

/**
 * Sidebar history chrome: per-project collapse and the Archived group,
 * persisted across restarts (§1.3, §1.10). Selection itself lives in
 * `session.svelte.ts` (`active`). Projects start expanded.
 */
export const sidebarUi = persisted('pi-history-ui', {
	collapsed: {} as Record<string, boolean>,
	showArchived: false
});

export function isCollapsed(projectId: string): boolean {
	return sidebarUi.collapsed[projectId] === true;
}

export function setCollapsed(projectId: string, collapsed: boolean) {
	const next = { ...sidebarUi.collapsed };
	if (collapsed) next[projectId] = true;
	else delete next[projectId];
	sidebarUi.collapsed = next;
}
