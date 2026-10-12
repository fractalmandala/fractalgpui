<script lang="ts">
	import type { Tabs } from '../kernel/dock/tree.ts';
	import { begin_drag, close_view_leaf, drop, focus_group, focus_leaf, open_view_in, toggle_zoom, ui } from '../kernel/dock/dock.svelte.ts';
	import { ensure_loaded, view_of, views } from '../kernel/views.svelte.ts';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Menu from '../ui/Menu.svelte';
	import DropZones from './DropZones.svelte';

	// One tab group: a header strip (a tab per leaf: click to show, drag to move, × to close, + to
	// add a view, then the active view's toolbar) over the active view. While a tab is dragged the
	// body is covered by DropZones and the header's tabs become reorder targets.
	let { group }: { group: Tabs } = $props();

	const active_leaf = $derived(group.leaves.find((l) => l.id === group.active) ?? group.leaves[0]);
	const view = $derived(active_leaf ? view_of(active_leaf.view) : undefined);
	const Body = $derived(view?.component);
	const Toolbar = $derived(view?.toolbar);
	const dragging = $derived(!!ui.drag);
	const menu_items = $derived(views.map((v) => ({ id: v.id, label: v.title, icon: v.icon, description: v.description })));

	$effect(() => {
		if (view) ensure_loaded(view);
	});

	// A drag starts at the first move after a press, so a plain click is still a click.
	let pressed = '';
	function down(leaf_id: string, e: { button?: number }) {
		if ((e.button ?? 0) === 0) pressed = leaf_id;
	}
	function move(e: { pressedButton?: number }) {
		if (!pressed) return;
		if (e.pressedButton !== 0) pressed = '';
		else {
			begin_drag(pressed);
			pressed = '';
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-pane box grow min0" testId={`group-${group.id}`} onmousedown={() => focus_group(group.id)}>
	<div class="wb-pane-head row ycenter gap-xs" testId={`head-${group.id}`} onmousemove={move} onmouseup={() => dragging && drop(group.id, 'center')}>
		<div class="row ycenter gap-xs grow min0">
			{#each group.leaves as leaf, i (leaf.id)}
				{@const v = view_of(leaf.view)}
				<div
					class="wb-ptab row ycenter gap-xs"
					class:active={leaf.id === group.active}
					class:dragging={ui.drag === leaf.id}
					hitbox="self"
					testId={`ptab-${leaf.id}`}
					onclick={() => focus_leaf(leaf.id)}
					onmousedown={(e: { button?: number }) => down(leaf.id, e)}
										onmouseup={(e: unknown) => {
						pressed = '';
						if (dragging) drop(group.id, 'center', i);
						void e;
					}}
				>
					{#if v}<Icon name={v.icon} tone="secondary" />{/if}
					<text class="truncate">{v?.title ?? leaf.view}</text>
					<div class="wb-ptab-x row xcenter ycenter" hitbox="self" testId={`pclose-${leaf.id}`} onclick={() => close_view_leaf(leaf.id)}>
						<Icon name="x" tone="muted" />
					</div>
				</div>
			{/each}
			<IconButton icon="plus" testId={`padd-${group.id}`} onclick={() => (ui.menu = ui.menu === group.id ? '' : group.id)} />
		</div>
		<div class="row ycenter gap-xs shrink-0">
			{#if Toolbar}<Toolbar />{/if}
			{#if ui.zoom === group.id}<IconButton icon="x" active testId={`pzoom-${group.id}`} onclick={toggle_zoom} />{/if}
		</div>
	</div>
	{#if ui.menu === group.id}
		<div class="wb-menu-pad box">
			<Menu
				items={menu_items}
				testId={`pmenu-${group.id}`}
				onselect={(id) => {
					ui.menu = '';
					open_view_in(id, group.id);
				}}
				onclose={() => (ui.menu = '')}
			/>
		</div>
	{/if}
	<div class="wb-pane-body box" testId={`body-${group.id}`}>
		{#if active_leaf && Body}
			{#key active_leaf.id}
				<div class="box grow min0" testId={`view-${active_leaf.view}`}><Body /></div>
			{/key}
		{/if}
		{#if dragging}<DropZones group={group.id} />{/if}
	</div>
</div>
