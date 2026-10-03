/**
 * Panel layout for the shell's sections (assets/wireframe-v1.png):
 *
 *   section-sidebar-left | section-main | section-sidebar-panel | section-sidebar-right
 *
 * section-main is never collapsible. The three sidebars are:
 * - sidebar-left: open by default; collapsed, it is a 52px icon rail. Its state is
 *   app-wide (it carries the surface nav), and persists.
 * - sidebar-panel, sidebar-right: collapsed by default. Each surface may declare its
 *   own defaults (`Surface.collapsed`); the user's toggles are then kept per surface,
 *   so switching surfaces restores that surface's own state.
 * - Widths are per surface: a surface's declared default applies until the user
 *   resizes that sidebar on that surface; double-clicking a splitter forgets it.
 * - `fit()` hides sidebars that don't fit the window (sidebar-right first, then
 *   sidebar-panel) without touching what the user chose.
 * Everything persists through `persisted('shell')` (debounced JSON write).
 */

import { persisted } from './storage.svelte.ts';

export type Region = 'sidebar-left' | 'sidebar-panel' | 'sidebar-right';
/** The sidebars whose open state is per surface. */
export type SurfaceRegion = Exclude<Region, 'sidebar-left'>;
export const REGIONS: Region[] = ['sidebar-left', 'sidebar-panel', 'sidebar-right'];
export const SURFACE_REGIONS: SurfaceRegion[] = ['sidebar-panel', 'sidebar-right'];

export const LIMITS: Record<Region, { min: number; max: number; default: number }> = {
	'sidebar-left': { min: 200, max: 360, default: 240 },
	'sidebar-panel': { min: 280, max: 520, default: 340 },
	'sidebar-right': { min: 260, max: 420, default: 300 }
};

/** Open/collapsed when neither the user nor the surface has said otherwise (wireframe: collapsed-default). */
export const DEFAULT_COLLAPSED: Record<SurfaceRegion, boolean> = { 'sidebar-panel': true, 'sidebar-right': true };

/** Width of the collapsed left sidebar (icons only). */
export const RAIL = 52;
/** section-main never gets narrower than this when sidebars are fitted. */
export const MAIN_MIN = 420;

export type Widths = Partial<Record<Region, number>>;
export type Collapsed = Partial<Record<SurfaceRegion, boolean>>;

/** What layout needs to know about a surface. */
export interface SurfaceLayout {
	id: string;
	layout?: Widths;
	collapsed?: Collapsed;
}

export const layout = persisted('shell', {
	leftCollapsed: false,
	collapsed: {} as Record<string, Collapsed>,
	widths: {} as Record<string, Widths>
});

export const clamp = (region: Region, w: number) => Math.round(Math.min(LIMITS[region].max, Math.max(LIMITS[region].min, w)));

export function width_of(region: Region, s: SurfaceLayout): number {
	return clamp(region, layout.widths[s.id]?.[region] ?? s.layout?.[region] ?? LIMITS[region].default);
}

export function set_width(region: Region, s: SurfaceLayout, w: number) {
	const next = clamp(region, w);
	const current = layout.widths[s.id];
	if (current?.[region] === next) return;
	layout.widths[s.id] = { ...current, [region]: next };
}

export function reset_width(region: Region, s: SurfaceLayout) {
	const current = layout.widths[s.id];
	if (!current || current[region] === undefined) return;
	const { [region]: _dropped, ...rest } = current;
	layout.widths[s.id] = rest;
}

export function is_collapsed(region: Region, s: SurfaceLayout): boolean {
	if (region === 'sidebar-left') return layout.leftCollapsed;
	return layout.collapsed[s.id]?.[region] ?? s.collapsed?.[region] ?? DEFAULT_COLLAPSED[region];
}

export function set_collapsed(region: Region, s: SurfaceLayout, value: boolean) {
	if (region === 'sidebar-left') return void (layout.leftCollapsed = value);
	layout.collapsed[s.id] = { ...layout.collapsed[s.id], [region]: value };
}

export const toggle = (region: Region, s: SurfaceLayout) => set_collapsed(region, s, !is_collapsed(region, s));

/** ⌘\: if any sidebar is open, collapse them all; otherwise open them all. */
export function toggle_all(s: SurfaceLayout) {
	const open = REGIONS.some((r) => !is_collapsed(r, s));
	for (const r of REGIONS) set_collapsed(r, s, open);
}

export type Shown = { 'sidebar-left': 'open' | 'rail'; 'sidebar-panel': boolean; 'sidebar-right': boolean };

/**
 * Which sidebars to actually show for a window width: the user's (or surface's)
 * choice first, then sidebar-right and sidebar-panel drop out (in that order) while
 * section-main would be narrower than MAIN_MIN.
 */
export function fit(window_width: number, s: SurfaceLayout, widths: Record<Region, number>): Shown {
	const left = is_collapsed('sidebar-left', s) ? 'rail' : 'open';
	let panel = !is_collapsed('sidebar-panel', s);
	let right = !is_collapsed('sidebar-right', s);
	const used = () => (left === 'open' ? widths['sidebar-left'] : RAIL) + (panel ? widths['sidebar-panel'] : 0) + (right ? widths['sidebar-right'] : 0);
	if (right && window_width - used() < MAIN_MIN) right = false;
	if (panel && window_width - used() < MAIN_MIN) panel = false;
	return { 'sidebar-left': left, 'sidebar-panel': panel, 'sidebar-right': right };
}
