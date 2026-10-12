/**
 * The dock's layout tree: pure data and pure operations (no UI, no state), so every
 * rule is a plain `bun test`. Shape, after TrellisUI:
 *
 *   Split  — children laid out in a row or a column, `sizes` are fractions that sum to 1
 *   Tabs   — a tab group: an ordered list of leaves, one active
 *   Leaf   — one view instance (`view` is a registry id)
 *
 * Every operation returns a NEW normalised tree and never mutates its input. Normalising
 * drops empty groups, replaces one-child splits by the child, merges a split into a parent
 * split of the same direction, and re-fits `sizes`. The root may be an empty `Tabs`.
 * `find_node` is the "render this subtree as the root" path that zoom uses.
 */

export type Dir = 'row' | 'col';
export type Zone = 'center' | 'left' | 'right' | 'top' | 'bottom';

export interface Leaf {
	kind: 'leaf';
	id: string;
	view: string;
}
export interface Tabs {
	kind: 'tabs';
	id: string;
	leaves: Leaf[];
	/** The active leaf's id ('' when the group is empty). */
	active: string;
}
export interface Split {
	kind: 'split';
	id: string;
	dir: Dir;
	children: (Split | Tabs)[];
	sizes: number[];
}
export type Node = Split | Tabs;

/** A pane never shrinks below this fraction of its split through a drag. */
export const MIN_SIZE = 0.08;

let seq = 0;
export const new_id = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const empty_tabs = (): Tabs => ({ kind: 'tabs', id: new_id('g'), leaves: [], active: '' });
export const make_leaf = (view: string): Leaf => ({ kind: 'leaf', id: new_id('l'), view });
export function make_tabs(views: string[], active = 0): Tabs {
	const leaves = views.map(make_leaf);
	return { kind: 'tabs', id: new_id('g'), leaves, active: leaves[Math.min(active, leaves.length - 1)]?.id ?? '' };
}
export const make_split = (dir: Dir, children: (Split | Tabs)[], sizes?: number[]): Split => ({
	kind: 'split',
	id: new_id('s'),
	dir,
	children,
	sizes: sizes ?? children.map(() => 1 / children.length)
});

// --- reading ------------------------------------------------------------------------

export function find_node(root: Node, id: string): Node | null {
	if (root.id === id) return root;
	if (root.kind === 'split') for (const c of root.children) {
		const hit = find_node(c, id);
		if (hit) return hit;
	}
	return null;
}

export function groups(root: Node): Tabs[] {
	return root.kind === 'tabs' ? [root] : root.children.flatMap(groups);
}
export const leaves = (root: Node): Leaf[] => groups(root).flatMap((g) => g.leaves);

export function find_leaf(root: Node, leaf_id: string): { leaf: Leaf; group: Tabs } | null {
	for (const group of groups(root)) {
		const leaf = group.leaves.find((l) => l.id === leaf_id);
		if (leaf) return { leaf, group };
	}
	return null;
}
export const find_view = (root: Node, view: string): { leaf: Leaf; group: Tabs } | null => {
	for (const group of groups(root)) {
		const leaf = group.leaves.find((l) => l.view === view);
		if (leaf) return { leaf, group };
	}
	return null;
};
export function parent_of(root: Node, id: string): Split | null {
	if (root.kind !== 'split') return null;
	for (const c of root.children) {
		if (c.id === id) return root;
		const hit = parent_of(c, id);
		if (hit) return hit;
	}
	return null;
}

// --- normalising --------------------------------------------------------------------

function fit_sizes(sizes: number[], n: number): number[] {
	const ok = sizes.length === n && sizes.every((s) => Number.isFinite(s) && s > 0);
	const raw = ok ? sizes : Array.from({ length: n }, () => 1);
	const total = raw.reduce((a, b) => a + b, 0);
	return raw.map((s) => s / total);
}

function norm(node: Node): Node | null {
	if (node.kind === 'tabs') {
		if (!node.leaves.length) return null;
		if (!node.leaves.some((l) => l.id === node.active)) node.active = node.leaves[node.leaves.length - 1].id;
		return node;
	}
	const kept: { node: Node; size: number }[] = [];
	node.children.forEach((c, i) => {
		const n = norm(c);
		if (n) kept.push({ node: n, size: node.sizes[i] ?? 1 / node.children.length });
	});
	if (!kept.length) return null;
	if (kept.length === 1) return kept[0].node;
	// Merge a child split of the same direction into this one.
	const children: (Split | Tabs)[] = [];
	const sizes: number[] = [];
	const total = kept.reduce((a, k) => a + k.size, 0) || 1;
	for (const k of kept) {
		const share = k.size / total;
		const inner = k.node;
		if (inner.kind === 'split' && inner.dir === node.dir) {
			inner.children.forEach((c, i) => {
				children.push(c);
				sizes.push(share * inner.sizes[i]);
			});
		} else {
			children.push(k.node);
			sizes.push(share);
		}
	}
	node.children = children;
	node.sizes = fit_sizes(sizes, children.length);
	return node;
}

/** A normalised copy; an empty tree becomes an empty tab group. */
export function normalize(root: Node): Node {
	return norm(clone(root)) ?? empty_tabs();
}

// --- operations ---------------------------------------------------------------------

/** Make a leaf the active tab of its group. */
export function activate(root: Node, leaf_id: string): Node {
	const t = clone(root);
	const hit = find_leaf(t, leaf_id);
	if (hit) hit.group.active = leaf_id;
	return t;
}

/** Add a view as a new tab in `group_id` (or the first group when missing/unknown); returns the new leaf's id too. */
export function add_view(root: Node, view: string, group_id?: string): { root: Node; leaf: string } {
	const t = clone(root);
	const gs = groups(t);
	const target = (group_id && gs.find((g) => g.id === group_id)) || gs[0];
	const leaf = make_leaf(view);
	target.leaves.push(leaf);
	target.active = leaf.id;
	return { root: normalize(t), leaf: leaf.id };
}

export function close_leaf(root: Node, leaf_id: string): Node {
	const t = clone(root);
	const hit = find_leaf(t, leaf_id);
	if (!hit) return t;
	const at = hit.group.leaves.findIndex((l) => l.id === leaf_id);
	hit.group.leaves.splice(at, 1);
	if (hit.group.active === leaf_id) hit.group.active = (hit.group.leaves[at] ?? hit.group.leaves[at - 1])?.id ?? '';
	return normalize(t);
}

/** Replace `node_id` by a split of [node, new group] (or [new group, node]) and keep that in the same-direction parent. */
function wrap(t: Node, target: Tabs, fresh: Tabs, dir: Dir, before: boolean): Node {
	const parent = parent_of(t, target.id);
	if (parent && parent.dir === dir) {
		const at = parent.children.findIndex((c) => c.id === target.id);
		const half = parent.sizes[at] / 2;
		parent.sizes[at] = half;
		parent.children.splice(before ? at : at + 1, 0, fresh);
		parent.sizes.splice(before ? at : at + 1, 0, half);
		return t;
	}
	const split = make_split(dir, before ? [fresh, { ...target }] : [{ ...target }, fresh], [0.5, 0.5]);
	if (!parent) return split;
	const at = parent.children.findIndex((c) => c.id === target.id);
	parent.children[at] = split;
	return t;
}

/**
 * Move a leaf. `center` adds it to the target group (at `index`, default the end);
 * the four edges split the target group and give the leaf its own new group there.
 * Moving a group's only leaf onto its own edge is a no-op.
 */
export function move_leaf(root: Node, leaf_id: string, target_group: string, zone: Zone, index?: number): Node {
	const t = clone(root);
	const src = find_leaf(t, leaf_id);
	const target = groups(t).find((g) => g.id === target_group);
	if (!src || !target) return t;
	if (zone !== 'center' && src.group.id === target.id && target.leaves.length === 1) return t;

	const leaf = src.leaf;
	const from = src.group.leaves.findIndex((l) => l.id === leaf_id);
	src.group.leaves.splice(from, 1);
	if (src.group.active === leaf_id) src.group.active = (src.group.leaves[from] ?? src.group.leaves[from - 1])?.id ?? '';

	let out: Node = t;
	if (zone === 'center') {
		// `index` counts positions before the removal; removing from the same group shifted later ones left.
		let at = index === undefined ? target.leaves.length : index;
		if (src.group.id === target.id && index !== undefined && index > from) at -= 1;
		at = Math.max(0, Math.min(at, target.leaves.length));
		target.leaves.splice(at, 0, leaf);
		target.active = leaf.id;
	} else {
		const fresh: Tabs = { kind: 'tabs', id: new_id('g'), leaves: [leaf], active: leaf.id };
		out = wrap(t, target, fresh, zone === 'left' || zone === 'right' ? 'row' : 'col', zone === 'left' || zone === 'top');
	}
	return normalize(out);
}

/**
 * Set the divider after child `index` of a split: sizes are taken from `start` (the sizes when a drag
 * began) and `delta` (a fraction of the split's length) moves the divider, clamped so both neighbours
 * keep at least MIN_SIZE.
 */
export function resize_split(root: Node, split_id: string, index: number, start: number[], delta: number): Node {
	const t = clone(root);
	const s = find_node(t, split_id);
	if (!s || s.kind !== 'split' || index < 0 || index >= s.children.length - 1 || start.length !== s.children.length) return t;
	const pair = start[index] + start[index + 1];
	const min = Math.min(MIN_SIZE, pair / 2);
	const a = Math.min(pair - min, Math.max(min, start[index] + delta));
	s.sizes = start.slice();
	s.sizes[index] = a;
	s.sizes[index + 1] = pair - a;
	return t;
}

/** Equal sizes for a split. */
export function even_split(root: Node, split_id: string): Node {
	const t = clone(root);
	const s = find_node(t, split_id);
	if (s?.kind === 'split') s.sizes = s.children.map(() => 1 / s.children.length);
	return t;
}

// --- persistence --------------------------------------------------------------------

/** Whether `v` has the shape of a tree (a stored value from an older or damaged file may not). */
export function is_node(v: unknown): v is Node {
	if (!v || typeof v !== 'object') return false;
	const n = v as Record<string, unknown>;
	if (typeof n.id !== 'string') return false;
	if (n.kind === 'tabs') return Array.isArray(n.leaves) && typeof n.active === 'string' && n.leaves.every((l) => !!l && typeof l === 'object' && (l as Leaf).kind === 'leaf' && typeof (l as Leaf).id === 'string' && typeof (l as Leaf).view === 'string');
	if (n.kind === 'split') return (n.dir === 'row' || n.dir === 'col') && Array.isArray(n.children) && Array.isArray(n.sizes) && n.children.every(is_node);
	return false;
}

/**
 * A stored tree made safe: wrong shape → `fallback`; leaves of views that no longer exist are
 * dropped; two leaves of the same singleton view keep the first.
 */
export function repair(stored: unknown, known: (view: string) => boolean, singleton: (view: string) => boolean, fallback: () => Node): Node {
	if (!is_node(stored)) return fallback();
	const t = clone(stored);
	const seen = new Set<string>();
	for (const g of groups(t)) {
		g.leaves = g.leaves.filter((l) => {
			if (!known(l.view)) return false;
			if (singleton(l.view)) {
				if (seen.has(l.view)) return false;
				seen.add(l.view);
			}
			return true;
		});
	}
	const out = normalize(t);
	return out.kind === 'tabs' && !out.leaves.length ? fallback() : out;
}
