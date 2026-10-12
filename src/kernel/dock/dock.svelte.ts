/**
 * The dock's reactive shell: the persisted layout tree plus the transient UI state (zoom,
 * drag, menus). All rules live in `tree.ts`; this module only applies them to `dock.root`
 * and remembers which group has focus. It knows nothing about the view registry (views
 * reach it through `open_view`, and `init_dock` is handed the registry's predicates), so
 * any module may import it without a cycle.
 */

import { persisted } from '../storage.svelte.ts';
import {
	activate,
	add_view,
	close_leaf,
	even_split,
	find_leaf,
	find_node,
	find_view,
	groups,
	make_split,
	make_tabs,
	move_leaf,
	repair,
	resize_split,
	type Node,
	type Zone
} from './tree.ts';

/** Sessions and bots on the left; the chat and the bot editor tabbed in the middle. */
export const default_root = (): Node => make_split('row', [make_tabs(['sessions', 'bots']), make_tabs(['chat', 'bot-editor'])], [0.24, 0.76]);

export const dock = persisted('dock', { root: default_root() as Node, focus: '' });

/** Transient state: nothing here is saved. */
export const ui = $state({
	/** A group or split id rendered as the whole dock (zoom); '' = the full tree. */
	zoom: '',
	/** The leaf being dragged ('' when not dragging). */
	drag: '',
	/** `<group>:<zone>` under the pointer while dragging. */
	over: '',
	/** The group whose "add view" menu is open. */
	menu: ''
});

let ready = false;
/** Drops views that no longer exist from the stored tree; run once the registry is known. */
export function init_dock(known: (view: string) => boolean) {
	if (ready) return;
	ready = true;
	dock.root = repair(dock.root, known, () => true, default_root);
	// New views open in the focused group: by default the one holding the chat (the main area).
	if (!find_node(dock.root, dock.focus)) dock.focus = (find_view(dock.root, 'chat')?.group ?? groups(dock.root)[0])?.id ?? '';
}

/** Focus a group without changing its tabs (a press anywhere in the pane). */
export function focus_group(group: string) {
	if (dock.focus !== group) dock.focus = group;
}

/** What the dock renders: the zoomed subtree, or the whole tree. */
export const shown_root = (): Node => (ui.zoom && find_node(dock.root, ui.zoom)) || dock.root;
export const focused_group = () => groups(dock.root).find((g) => g.id === dock.focus) ?? groups(dock.root)[0];

/** The view whose leaf is the focused group's active tab. */
export function focused_view(): string | null {
	const g = focused_group();
	return g?.leaves.find((l) => l.id === g.active)?.view ?? null;
}

export function focus_leaf(leaf_id: string) {
	const hit = find_leaf(dock.root, leaf_id);
	if (!hit) return;
	dock.root = activate(dock.root, leaf_id);
	dock.focus = hit.group.id;
}

/** Show a view: bring its tab forward if it is open, else add it to the main area. */
export function open_view(view: string) {
	const open = find_view(dock.root, view);
	if (open) {
		if (ui.zoom && !find_node(find_node(dock.root, ui.zoom) ?? dock.root, open.group.id)) ui.zoom = '';
		return focus_leaf(open.leaf.id);
	}
	// A new view opens in the main area (the group holding the chat), else in the focused group. The "+"
	// menu of a pane opens a view in that pane instead (`open_view_in`).
	const target = find_view(dock.root, 'chat')?.group ?? focused_group();
	const added = add_view(dock.root, view, target?.id);
	dock.root = added.root;
	const hit = find_leaf(dock.root, added.leaf);
	if (hit) dock.focus = hit.group.id;
}

/** Show a view in a specific group (the group's "add view" menu); an already-open view just comes forward. */
export function open_view_in(view: string, group: string) {
	if (find_view(dock.root, view)) return open_view(view);
	const added = add_view(dock.root, view, group);
	dock.root = added.root;
	const hit = find_leaf(dock.root, added.leaf);
	if (hit) dock.focus = hit.group.id;
}

export function close_view_leaf(leaf_id: string) {
	const next = close_leaf(dock.root, leaf_id);
	dock.root = next;
	if (ui.zoom && !find_node(next, ui.zoom)) ui.zoom = '';
	if (!find_node(next, dock.focus)) dock.focus = groups(next)[0]?.id ?? '';
}

export function move(leaf_id: string, group: string, zone: Zone, index?: number) {
	dock.root = move_leaf(dock.root, leaf_id, group, zone, index);
	const hit = find_leaf(dock.root, leaf_id);
	if (hit) dock.focus = hit.group.id;
	if (ui.zoom && !find_node(dock.root, ui.zoom)) ui.zoom = '';
}

export const resize = (split: string, index: number, start: number[], delta: number) => {
	dock.root = resize_split(dock.root, split, index, start, delta);
};
export const even = (split: string) => {
	dock.root = even_split(dock.root, split);
};

export function reset_layout() {
	ui.zoom = '';
	ui.drag = '';
	ui.menu = '';
	dock.root = default_root();
	dock.focus = groups(dock.root)[0].id;
}

/** Zoom the focused group (render it alone); calling again returns to the full layout. */
export function toggle_zoom() {
	if (ui.zoom) return void (ui.zoom = '');
	const g = focused_group();
	if (g && groups(dock.root).length > 1) ui.zoom = g.id;
}

export function cycle_tab(delta: number) {
	const g = focused_group();
	if (!g || g.leaves.length < 2) return;
	const at = Math.max(0, g.leaves.findIndex((l) => l.id === g.active));
	focus_leaf(g.leaves[(at + delta + g.leaves.length) % g.leaves.length].id);
}

// --- drag and drop ---------------------------------------------------------------------

export const begin_drag = (leaf_id: string) => {
	ui.drag = leaf_id;
	ui.over = '';
	ui.menu = '';
};
export function cancel_drag() {
	ui.drag = '';
	ui.over = '';
}
/** Drop the dragged tab; always ends the drag. */
export function drop(group: string, zone: Zone, index?: number) {
	const leaf = ui.drag;
	cancel_drag();
	if (leaf) move(leaf, group, zone, index);
}
