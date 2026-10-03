/**
 * Panel layout: the three collapsible sidebars and their widths.
 *
 * - Widths are stored per surface: a surface's declared default applies until the
 *   user resizes that panel on that surface; double-clicking a splitter forgets it.
 * - Collapse flags are global (a closed inspector stays closed as you switch).
 * - A collapsed left sidebar becomes a 52px icon rail; the right panels go to 0.
 * - `fit()` hides panels that don't fit the window (inspector first, then agent),
 *   without touching what the user chose.
 * Everything persists through `persisted('layout')` (debounced JSON write).
 */

import { persisted } from './storage.svelte.ts';

export type Region = 'left' | 'agent' | 'inspector';
export const REGIONS: Region[] = ['left', 'agent', 'inspector'];

export const LIMITS: Record<Region, { min: number; max: number; default: number }> = {
	left: { min: 200, max: 360, default: 240 },
	agent: { min: 280, max: 520, default: 340 },
	inspector: { min: 260, max: 420, default: 300 }
};

/** Width of the collapsed left sidebar (icons only). */
export const RAIL = 52;
/** The main area never gets narrower than this when panels are fitted. */
export const MAIN_MIN = 420;

export type Widths = Partial<Record<Region, number>>;

export const layout = persisted('layout', {
	collapsed: { left: false, agent: false, inspector: false } as Record<Region, boolean>,
	widths: {} as Record<string, Widths>
});

export const clamp = (region: Region, w: number) => Math.round(Math.min(LIMITS[region].max, Math.max(LIMITS[region].min, w)));

export function width_of(region: Region, surface: string, defaults: Widths = {}): number {
	return clamp(region, layout.widths[surface]?.[region] ?? defaults[region] ?? LIMITS[region].default);
}

export function set_width(region: Region, surface: string, w: number) {
	const next = clamp(region, w);
	const current = layout.widths[surface];
	if (current?.[region] === next) return;
	layout.widths[surface] = { ...current, [region]: next };
}

export function reset_width(region: Region, surface: string) {
	const current = layout.widths[surface];
	if (!current || current[region] === undefined) return;
	const { [region]: _dropped, ...rest } = current;
	layout.widths[surface] = rest;
}

export const is_collapsed = (region: Region) => layout.collapsed[region] === true;

export function toggle(region: Region) {
	layout.collapsed[region] = !layout.collapsed[region];
}

export function set_collapsed(region: Region, value: boolean) {
	layout.collapsed[region] = value;
}

/** ⌘\: if any panel is open, close them all; otherwise open them all. */
export function toggle_all() {
	const open = REGIONS.some((r) => !layout.collapsed[r]);
	for (const r of REGIONS) layout.collapsed[r] = open;
}

/**
 * Which panels to actually show, for a window width: the surface's slots and the
 * user's choices first, then the inspector and agent drop out (in that order) while
 * the main area would be narrower than MAIN_MIN.
 */
export function fit(
	window_width: number,
	has: Record<Region, boolean>,
	widths: Record<Region, number>
): { left: 'open' | 'rail' | 'none'; agent: boolean; inspector: boolean } {
	const left = !has.left ? 'none' : is_collapsed('left') ? 'rail' : 'open';
	let agent = has.agent && !is_collapsed('agent');
	let inspector = has.inspector && !is_collapsed('inspector');
	const used = () => (left === 'open' ? widths.left : left === 'rail' ? RAIL : 0) + (agent ? widths.agent : 0) + (inspector ? widths.inspector : 0);
	if (inspector && window_width - used() < MAIN_MIN) inspector = false;
	if (agent && window_width - used() < MAIN_MIN) agent = false;
	return { left, agent, inspector };
}
