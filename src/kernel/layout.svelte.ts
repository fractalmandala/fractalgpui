/**
 * Panel layout for the shell's sections (assets/wireframe-v1.png):
 *
 *   section-sidebar-left | section-main | section-sidebar-panel | section-sidebar-right
 *
 * section-main is never collapsible. The three sidebars are:
 * - sidebar-left: open by default; collapsed, it animates to 0 width (no rail).
 *   Its state is app-wide (it carries the surface nav), and persists.
 * - sidebar-panel, sidebar-right: collapsed by default. Each surface may declare its
 *   own defaults (`Surface.collapsed`); the user's toggles are then kept per surface,
 *   so switching surfaces restores that surface's own state.
 * - Widths are per surface: a surface's declared default applies until the user
 *   resizes that sidebar on that surface; double-clicking a splitter forgets it.
 * - `fit()` hides sidebars that don't fit the window (sidebar-right first, then
 *   sidebar-panel) without touching what the user chose.
 * Everything persists through `persisted('shell')` (debounced JSON write).
 */

import { design } from './design.svelte.ts';
import { persisted } from './storage.svelte.ts';

export type Region = 'sidebar-left' | 'sidebar-panel' | 'sidebar-right';
/** The sidebars whose open state is per surface. */
export type SurfaceRegion = Exclude<Region, 'sidebar-left'>;
export const REGIONS: Region[] = ['sidebar-left', 'sidebar-panel', 'sidebar-right'];
export const SURFACE_REGIONS: SurfaceRegion[] = ['sidebar-panel', 'sidebar-right'];

/** The fractalstyler token each sidebar's default width reads (all 280px today). */
export const WIDTH_TOKENS: Record<Region, string> = {
	'sidebar-left': 'sidebar-width-left',
	'sidebar-panel': 'sidebar-width',
	'sidebar-right': 'sidebar-width-right'
};
/** fractalstyler's `--sidebar-width`, for before the style build has published tokens. */
const SIDEBAR_WIDTH = 280;

const token_px = (name: string) => {
	const v = parseFloat(design.tokens.light[name] ?? '');
	return Number.isFinite(v) ? v : SIDEBAR_WIDTH;
};
const limits = (region: Region, min: number, max: number) => ({
	min,
	max,
	/** The flattened fractalstyler token, so a token change moves the default too. */
	get default() {
		return token_px(WIDTH_TOKENS[region]);
	}
});

export const LIMITS: Record<Region, { min: number; max: number; readonly default: number }> = {
	'sidebar-left': limits('sidebar-left', 200, 360),
	'sidebar-panel': limits('sidebar-panel', 280, 520),
	'sidebar-right': limits('sidebar-right', 260, 420)
};

/** Open/collapsed when neither the user nor the surface has said otherwise (wireframe: collapsed-default). */
export const DEFAULT_COLLAPSED: Record<SurfaceRegion, boolean> = { 'sidebar-panel': true, 'sidebar-right': true };

/** section-main never gets narrower than this when sidebars are fitted. */
 export const MAIN_MIN = 420;

/**
  * Collapse/expand transition length (seconds, for the native `motion` prop).
  * Instant under headless tests (memory clipboard), so widths assert
  * deterministically; real motion in production.
  */
 export const motion_duration = () => (process.env.FRACTALGPUI_CLIPBOARD === 'memory' ? 0 : 0.2);

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

 export type Shown = Record<Region, boolean>;

/** User-choice openness, before window fitting (true = the user wants it open). */
 export function shown_state(s: SurfaceLayout): Shown {
	return {
		'sidebar-left': !is_collapsed('sidebar-left', s),
		'sidebar-panel': !is_collapsed('sidebar-panel', s),
		'sidebar-right': !is_collapsed('sidebar-right', s)
	};
 }

/**
  * Openness plus whether each sidebar fits the window. Collapsed sidebars stay
  * mounted at 0 width (animated through the `motion` prop); sidebar-panel and
  * sidebar-right unmount only when the window has no room for them
  * (sidebar-right first), without touching what the user chose.
  */
export function fit(window_width: number, s: SurfaceLayout, widths: Record<Region, number>): { open: Shown; fits: Shown } {
	const open = shown_state(s);
	// Room for each sidebar, assuming it were open: collapsed ones stay mounted
	// (width animates to 0) and only lose their mount when the window is narrow.
	const fits: Shown = { 'sidebar-left': true, 'sidebar-panel': true, 'sidebar-right': true };
	const used = () => (open['sidebar-left'] ? widths['sidebar-left'] : 0) + (open['sidebar-panel'] && fits['sidebar-panel'] ? widths['sidebar-panel'] : 0) + (open['sidebar-right'] && fits['sidebar-right'] ? widths['sidebar-right'] : 0);
	if (open['sidebar-right'] && window_width - used() < MAIN_MIN) fits['sidebar-right'] = false;
	if (open['sidebar-panel'] && window_width - used() < MAIN_MIN) fits['sidebar-panel'] = false;
	return { open, fits };
 }
