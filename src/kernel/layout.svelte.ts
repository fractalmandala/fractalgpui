/**
 * Panel layout: the three collapsible sidebars and their widths.
 *
 * - Widths are stored per surface: a surface's declared default applies until the
 *   user resizes that panel on that surface; double-clicking a splitter forgets it.
 * - Collapse flags are global (a closed right panel stays closed as you switch).
 * - A collapsed left sidebar becomes a 52px icon rail; the right panels go to 0.
 * - `fit()` hides panels that don't fit the window (rightB first, then rightA),
 *   without touching what the user chose.
 * Everything persists through `persisted('layout')` (debounced JSON write).
 */

import { persisted } from './storage.svelte.ts';

export type Region = 'left' | 'rightA' | 'rightB';
export type RightRegion = Exclude<Region, 'left'>;
export const REGIONS: Region[] = ['left', 'rightA', 'rightB'];

export const LIMITS: Record<Region, { min: number; max: number; default: number }> = {
	left: { min: 200, max: 360, default: 240 },
	rightA: { min: 280, max: 520, default: 340 },
	rightB: { min: 260, max: 420, default: 300 }
};

/** Width of the collapsed left sidebar (icons only). */
export const RAIL = 52;
/** The main area never gets narrower than this when panels are fitted. */
export const MAIN_MIN = 420;

export type Widths = Partial<Record<Region, number>>;

export const layout = persisted('layout', {
	collapsed: { left: false, rightA: false, rightB: false } as Record<Region, boolean>,
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
 * user's choices first, then right panel B and right panel A drop out (in that order) while
 * the main area would be narrower than MAIN_MIN.
 */
export function fit(
	window_width: number,
	has: Record<Region, boolean>,
	widths: Record<Region, number>
): { left: 'open' | 'rail' | 'none'; rightA: boolean; rightB: boolean } {
	const left = !has.left ? 'none' : is_collapsed('left') ? 'rail' : 'open';
	let rightA = has.rightA && !is_collapsed('rightA');
	let rightB = has.rightB && !is_collapsed('rightB');
	const used = () => (left === 'open' ? widths.left : left === 'rail' ? RAIL : 0) + (rightA ? widths.rightA : 0) + (rightB ? widths.rightB : 0);
	if (rightB && window_width - used() < MAIN_MIN) rightB = false;
	if (rightA && window_width - used() < MAIN_MIN) rightA = false;
	return { left, rightA, rightB };
}
