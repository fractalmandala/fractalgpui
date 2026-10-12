/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there rather than a guard in every component.
 */

import { get_native } from './renderer.ts';
import type { GpuixEvent, ShadowNode, WindowNative } from './types.ts';

const win = () => get_native() as WindowNative | null;

export const set_window_title = (title: string) => win()?.setWindowTitle?.(title);

/** Brings a window opened with `show: false` or `focus: false` forward. */
export const activate_window = () => win()?.activateWindow?.();

/** Gives focus back from an `<input>` / `<textarea>` to the window. */
export const blur = () => win()?.blur?.();

/** `node` is a shadow node, from `{@attach}` or `use:`. */
export function focus_element(node: { nativeId?: number | null } | null | undefined) {
	if (node?.nativeId != null) win()?.focusElement?.(node.nativeId);
}

/** Starts an OS window drag from the left mouse-down being handled (macOS; a no-op elsewhere). */
export const start_window_move = () => win()?.startWindowMove?.();

/** The system titlebar double-click action: zoom or minimize, per the macOS setting. */
export const titlebar_double_click = () => win()?.titlebarDoubleClick?.();

/**
 * `onmousedown` handler for an app-drawn title bar (windows opened with
 * `titlebarTransparent`, whose native bar no longer drags). Left button only. A press on
 * an interactive child (any node between the target and the region that has its own
 * listeners, or is an input/textarea, or is marked `data-no-drag`) is left alone, so
 * buttons inside keep their clicks. Double-click runs the system action; a press drags.
 */
export function window_drag(e: GpuixEvent) {
	if ((e.button ?? 0) !== 0) return;
	for (let n: ShadowNode | null = e.target; n && n !== e.currentTarget; n = n.parent) {
		if (n.listeners.size > 0 || n.name === 'input' || n.name === 'textarea' || 'data-no-drag' in n.attrs) return;
	}
	if ((e.clickCount ?? 1) >= 2) titlebar_double_click();
	else start_window_move();
}
