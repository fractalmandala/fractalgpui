<script lang="ts">
	import { get_native } from 'gpuix-svelte/renderer';
	import type { Node } from '../kernel/dock/tree.ts';
	import { resize } from '../kernel/dock/dock.svelte.ts';
	import DockNode from './DockNode.svelte';
	import DockTabs from './DockTabs.svelte';

	// One node of the layout tree. A split lays its children out in a row or a column with a
	// gutter (exactly --wb-pane-gap) between neighbours; the gutter's grab area resizes the two
	// panes beside it. Sizes are flex-grow weights (a live number: the one inline style, like a
	// sidebar width), so every pane keeps its share when the window resizes.
	let { node }: { node: Node } = $props();

	let box_id: number | string | undefined;
	let drag: { index: number; start: number[]; at: number; length: number } | null = null;
	let active = $state(-1);

	type Pointer = { x?: number; y?: number; pressedButton?: number };

	function length_of(dir: 'row' | 'col'): number {
		const native = get_native();
		const b = box_id !== undefined ? native?.getElementBounds(box_id as never) : null;
		return (dir === 'row' ? b?.[2] : b?.[3]) || 1;
	}

	function down(index: number, e: Pointer) {
		if (node.kind !== 'split') return;
		drag = { index, start: node.sizes.slice(), at: (node.dir === 'row' ? e.x : e.y) ?? 0, length: length_of(node.dir) };
		active = index;
	}
	function move(e: Pointer) {
		if (!drag || node.kind !== 'split') return;
		if (e.pressedButton !== 0) return end();
		const now = (node.dir === 'row' ? e.x : e.y) ?? drag.at;
		resize(node.id, drag.index, drag.start, (now - drag.at) / drag.length);
	}
	function end() {
		drag = null;
		active = -1;
	}
</script>

{#if node.kind === 'tabs'}
	<DockTabs group={node} />
{:else if node.dir === 'row'}
	<div class="row grow min0" testId={`split-${node.id}`} {@attach (n: { nativeId?: number }) => (box_id = n.nativeId)}>
		{#each node.children as child, i (child.id)}
			{#if i > 0}
				<div class="wb-gutter-row box">
					<div
						class="wb-gutter-hit-row"
						class:dragging={active === i - 1}
						hitbox="self"
						testId={`gutter-${node.id}-${i - 1}`}
						onmousedown={(e: Pointer) => down(i - 1, e)}
						onmousemove={move}
						onmouseup={end}
					></div>
				</div>
			{/if}
			<div class="box min0" style={`flex-grow: ${node.sizes[i]}; flex-basis: 0px`} testId={`slot-${child.id}`}>
				<DockNode node={child} />
			</div>
		{/each}
	</div>
{:else}
	<div class="box grow min0" testId={`split-${node.id}`} {@attach (n: { nativeId?: number }) => (box_id = n.nativeId)}>
		{#each node.children as child, i (child.id)}
			{#if i > 0}
				<div class="wb-gutter-col box">
					<div
						class="wb-gutter-hit-col"
						class:dragging={active === i - 1}
						hitbox="self"
						testId={`gutter-${node.id}-${i - 1}`}
						onmousedown={(e: Pointer) => down(i - 1, e)}
						onmousemove={move}
						onmouseup={end}
					></div>
				</div>
			{/if}
			<div class="box min0" style={`flex-grow: ${node.sizes[i]}; flex-basis: 0px`} testId={`slot-${child.id}`}>
				<DockNode node={child} />
			</div>
		{/each}
	</div>
{/if}
