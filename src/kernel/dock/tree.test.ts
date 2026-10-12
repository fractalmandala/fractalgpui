import { describe, expect, test } from 'bun:test';
import {
	activate,
	add_view,
	close_leaf,
	even_split,
	find_leaf,
	find_node,
	find_view,
	groups,
	is_node,
	leaves,
	make_split,
	make_tabs,
	MIN_SIZE,
	move_leaf,
	normalize,
	parent_of,
	repair,
	resize_split,
	type Node,
	type Split,
	type Tabs
} from './tree.ts';

const views = (n: Node) => leaves(n).map((l) => l.view);
const sum = (s: Split) => s.sizes.reduce((a, b) => a + b, 0);
const sample = () => make_split('row', [make_tabs(['a', 'b']), make_tabs(['c'])], [0.25, 0.75]) as Split;
const first = (n: Node) => groups(n)[0];

describe('reading', () => {
	test('finds nodes, leaves, views and parents', () => {
		const t = sample();
		const g = t.children[0] as Tabs;
		expect(find_node(t, g.id)).toEqual(g);
		expect(find_node(t, 'nope')).toBeNull();
		expect(find_leaf(t, g.leaves[1].id)?.group.id).toBe(g.id);
		expect(find_view(t, 'c')?.group.id).toBe(t.children[1].id);
		expect(parent_of(t, g.id)?.id).toBe(t.id);
		expect(parent_of(t, t.id)).toBeNull();
		expect(views(t)).toEqual(['a', 'b', 'c']);
	});
});

describe('activate, add and close', () => {
	test('activate switches the active tab without touching the input', () => {
		const t = sample();
		const g = t.children[0] as Tabs;
		const before = JSON.stringify(t);
		const next = activate(t, g.leaves[0].id) as Split;
		expect((next.children[0] as Tabs).active).toBe(g.leaves[0].id);
		expect(JSON.stringify(t)).toBe(before);
	});
	test('add_view targets a group, else the first, and activates the new tab', () => {
		const t = sample();
		const second = t.children[1].id;
		const a = add_view(t, 'x', second);
		expect(views(a.root)).toEqual(['a', 'b', 'c', 'x']);
		expect(find_leaf(a.root, a.leaf)?.group.active).toBe(a.leaf);
		expect(find_leaf(a.root, a.leaf)?.group.id).toBe(second);
		expect(find_leaf(add_view(t, 'y', 'unknown').root, 'x')).toBeNull();
		expect(groups(add_view(t, 'y', 'unknown').root)[0].leaves.at(-1)?.view).toBe('y');
	});
	test('closing a tab activates its neighbour', () => {
		const t = sample();
		const g = t.children[0] as Tabs;
		g.active = g.leaves[0].id;
		const next = close_leaf(t, g.leaves[0].id);
		expect(first(next).leaves.map((l) => l.view)).toEqual(['b']);
		expect(first(next).active).toBe(first(next).leaves[0].id);
	});
	test('closing the last tab of a group removes the group and the split collapses', () => {
		const t = sample();
		const only = (t.children[1] as Tabs).leaves[0].id;
		const next = close_leaf(t, only);
		expect(next.kind).toBe('tabs');
		expect(views(next)).toEqual(['a', 'b']);
	});
	test('closing everything leaves an empty root group, never null', () => {
		let t: Node = make_tabs(['a']);
		t = close_leaf(t, (t as Tabs).leaves[0].id);
		expect(t.kind).toBe('tabs');
		expect(leaves(t)).toEqual([]);
		expect(add_view(t, 'z').root.kind).toBe('tabs');
		expect(views(add_view(t, 'z').root)).toEqual(['z']);
	});
});

describe('move_leaf', () => {
	test('center moves a tab between groups, at an index, and activates it', () => {
		const t = sample();
		const a = (t.children[0] as Tabs).leaves[0];
		const target = t.children[1].id;
		const next = move_leaf(t, a.id, target, 'center', 0) as Split;
		expect((next.children[1] as Tabs).leaves.map((l) => l.view)).toEqual(['a', 'c']);
		expect((next.children[1] as Tabs).active).toBe(a.id);
		expect((next.children[0] as Tabs).leaves.map((l) => l.view)).toEqual(['b']);
	});
	test('center within a group reorders', () => {
		const t = sample();
		const g = t.children[0] as Tabs;
		const next = move_leaf(t, g.leaves[0].id, g.id, 'center', 2);
		expect(first(next).leaves.map((l) => l.view)).toEqual(['b', 'a']);
		const back = move_leaf(next, first(next).leaves[1].id, g.id, 'center', 0);
		expect(first(back).leaves.map((l) => l.view)).toEqual(['a', 'b']);
	});
	test('an edge splits the target, in the right direction and order', () => {
		const t = make_tabs(['a', 'b']);
		const b = t.leaves[1];
		const right = move_leaf(t, b.id, t.id, 'right') as Split;
		expect([right.kind, right.dir, views(right)]).toEqual(['split', 'row', ['a', 'b']]);
		expect(sum(right)).toBeCloseTo(1);
		const top = move_leaf(t, b.id, t.id, 'top') as Split;
		expect([top.dir, views(top)]).toEqual(['col', ['b', 'a']]);
		const left = move_leaf(t, b.id, t.id, 'left') as Split;
		expect([left.dir, views(left)]).toEqual(['row', ['b', 'a']]);
		const bottom = move_leaf(t, b.id, t.id, 'bottom') as Split;
		expect([bottom.dir, views(bottom)]).toEqual(['col', ['a', 'b']]);
	});
	test('splitting inside a same-direction parent adds a sibling and halves the target share', () => {
		const t = sample();
		const a = (t.children[0] as Tabs).leaves[0];
		const next = move_leaf(t, a.id, t.children[1].id, 'right') as Split;
		expect(next.children.length).toBe(3);
		expect(next.sizes[0]).toBeCloseTo(0.25);
		expect(next.sizes[1]).toBeCloseTo(0.375);
		expect(next.sizes[2]).toBeCloseTo(0.375);
		expect(views(next)).toEqual(['b', 'c', 'a']);
	});
	test('splitting across the parent direction nests a split', () => {
		const t = sample();
		const a = (t.children[0] as Tabs).leaves[0];
		const next = move_leaf(t, a.id, t.children[1].id, 'bottom') as Split;
		expect(next.children.length).toBe(2);
		const nested = next.children[1] as Split;
		expect([nested.kind, nested.dir, views(nested)]).toEqual(['split', 'col', ['c', 'a']]);
	});
	test('moving the only leaf of a group onto its own edge is a no-op; moving it away removes the group', () => {
		const t = sample();
		const c = t.children[1] as Tabs;
		expect(JSON.stringify(move_leaf(t, c.leaves[0].id, c.id, 'left'))).toBe(JSON.stringify(t));
		const away = move_leaf(t, c.leaves[0].id, (t.children[0] as Tabs).id, 'center');
		expect(away.kind).toBe('tabs');
		expect(views(away)).toEqual(['a', 'b', 'c']);
	});
	test('unknown leaf or target changes nothing', () => {
		const t = sample();
		expect(JSON.stringify(move_leaf(t, 'x', t.children[0].id, 'center'))).toBe(JSON.stringify(t));
		expect(JSON.stringify(move_leaf(t, (t.children[0] as Tabs).leaves[0].id, 'x', 'center'))).toBe(JSON.stringify(t));
	});
	test('the other views are untouched by any move', () => {
		const t = sample();
		const a = (t.children[0] as Tabs).leaves[0];
		for (const z of ['center', 'left', 'right', 'top', 'bottom'] as const) {
			const next = move_leaf(t, a.id, t.children[1].id, z);
			expect(views(next).slice().sort()).toEqual(['a', 'b', 'c']);
			expect(find_leaf(next, a.id)).not.toBeNull();
		}
	});
});

describe('resize', () => {
	test('moves the divider from the drag-start sizes and keeps the sum', () => {
		const t = sample();
		const next = resize_split(t, t.id, 0, t.sizes, 0.25) as Split;
		expect(next.sizes[0]).toBeCloseTo(0.5);
		expect(next.sizes[1]).toBeCloseTo(0.5);
		const again = resize_split(next, t.id, 0, t.sizes, 0.1) as Split;
		expect(again.sizes[0]).toBeCloseTo(0.35);
		expect(sum(again)).toBeCloseTo(1);
	});
	test('clamps so neither neighbour drops below MIN_SIZE', () => {
		const t = sample();
		expect((resize_split(t, t.id, 0, t.sizes, 5) as Split).sizes[1]).toBeCloseTo(MIN_SIZE);
		expect((resize_split(t, t.id, 0, t.sizes, -5) as Split).sizes[0]).toBeCloseTo(MIN_SIZE);
	});
	test('only the two neighbours of the divider change', () => {
		const t = make_split('row', [make_tabs(['a']), make_tabs(['b']), make_tabs(['c'])], [0.2, 0.3, 0.5]) as Split;
		const next = resize_split(t, t.id, 1, t.sizes, 0.1) as Split;
		expect(next.sizes[0]).toBeCloseTo(0.2);
		expect(next.sizes[1]).toBeCloseTo(0.4);
		expect(next.sizes[2]).toBeCloseTo(0.4);
	});
	test('a bad index or split is ignored, even_split resets', () => {
		const t = sample();
		expect(JSON.stringify(resize_split(t, t.id, 1, t.sizes, 0.1))).toBe(JSON.stringify(t));
		expect(JSON.stringify(resize_split(t, 'nope', 0, t.sizes, 0.1))).toBe(JSON.stringify(t));
		expect((even_split(t, t.id) as Split).sizes).toEqual([0.5, 0.5]);
	});
});

describe('normalize and subtree', () => {
	test('merges same-direction nesting and fits sizes', () => {
		const inner = make_split('row', [make_tabs(['b']), make_tabs(['c'])], [0.5, 0.5]);
		const t = normalize(make_split('row', [make_tabs(['a']), inner], [0.5, 0.5])) as Split;
		expect(t.children.length).toBe(3);
		expect(t.sizes[0]).toBeCloseTo(0.5);
		expect(t.sizes[1]).toBeCloseTo(0.25);
		expect(sum(t)).toBeCloseTo(1);
	});
	test('bad sizes are replaced by equal ones', () => {
		const s = make_split('col', [make_tabs(['a']), make_tabs(['b'])], [0, NaN]);
		expect((normalize(s) as Split).sizes).toEqual([0.5, 0.5]);
	});
	test('a subtree is a complete tree on its own (the zoom path)', () => {
		const inner = make_split('col', [make_tabs(['b']), make_tabs(['c'])]);
		const t = make_split('row', [make_tabs(['a']), inner]);
		const sub = find_node(t, inner.id)!;
		expect(views(sub)).toEqual(['b', 'c']);
		const [top, bottom] = (sub as Split).children as Tabs[];
		expect(views(move_leaf(sub, top.leaves[0].id, bottom.id, 'center'))).toEqual(['c', 'b']);
	});
});

describe('persistence', () => {
	const known = (v: string) => ['a', 'b', 'c'].includes(v);
	const single = () => true;
	const fallback = () => make_tabs(['a']);
	test('is_node accepts trees and rejects junk', () => {
		expect(is_node(sample())).toBe(true);
		expect(is_node({ kind: 'tabs', id: 'x', leaves: [{}], active: '' })).toBe(false);
		expect(is_node(null)).toBe(false);
		expect(is_node({})).toBe(false);
	});
	test('survives a JSON round trip', () => {
		const t = sample();
		expect(repair(JSON.parse(JSON.stringify(t)), known, single, fallback)).toEqual(t);
	});
	test('drops unknown views and duplicate singletons; junk gets the fallback', () => {
		const t = make_split('row', [make_tabs(['a', 'gone']), make_tabs(['a', 'c'])]);
		const fixed = repair(t, known, single, fallback);
		expect(views(fixed)).toEqual(['a', 'c']);
		expect(repair({ nonsense: 1 }, known, single, fallback).kind).toBe('tabs');
		expect(views(repair(make_tabs(['gone']), known, single, fallback))).toEqual(['a']);
	});
});
