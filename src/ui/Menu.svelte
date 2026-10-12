<script lang="ts" module>
	// Shared menu item shape for Menu/ContextMenu and every menu built on them.
	import type { IconName } from './icons.ts';

	export interface MenuItem {
		id: string;
		label: string;
		description?: string;
		icon?: IconName;
		checked?: boolean;
		danger?: boolean;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	// An anchored item list: icon, label, description, check, danger row.
	// Keyboard nav (↑/↓/Enter/Esc), outside click closes. Rendered in flow,
	// directly under its trigger — the runtime has no element-measurement API,
	// so "anchored" means adjacent in layout, never floating at coordinates.
	let {
		items,
		onselect,
		onclose,
		testId = 'menu'
	}: {
		items: MenuItem[];
		onselect: (id: string) => void;
		onclose: () => void;
		testId?: string;
	} = $props();

	let highlight = $state(0);

	function key(e: { key?: string }) {
		const k = (e.key ?? '').toLowerCase();
		if (k === 'escape') return onclose();
		if (k === 'arrowdown' || k === 'arrowup') {
			const delta = k === 'arrowdown' ? 1 : -1;
			const n = items.length;
			if (n) highlight = (highlight + delta + n) % n;
			return;
		}
		if (k === 'enter') {
			const item = items[highlight];
			if (item && !item.disabled) onselect(item.id);
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-menu box gap-xs" {testId} hitbox="self" autofocus onkeydown={key} onmousedownoutside={onclose}>
	{#each items as item, i (item.id)}
		<div
			class="wb-palette-item box gap-xs px-sm radius-sm"
			class:active={i === highlight}
			hitbox="self"
			testId={`${testId}-${item.id}`}
			onclick={() => {
				if (!item.disabled) onselect(item.id);
			}}
			onmouseenter={() => (highlight = i)}
		>
			<div class="row ycenter gap-sm">
				{#if item.icon}<Icon name={item.icon} tone="secondary" />{/if}
				<div class="box grow min0">
					<text class="text-sm text-primary truncate" class:text-danger={item.danger}>{item.label}</text>
					{#if item.description}<text class="text-xs text-muted truncate">{item.description}</text>{/if}
				</div>
				{#if item.checked}<Icon name="check" tone="accent" />{/if}
			</div>
		</div>
	{:else}
		<div class="row ycenter px-sm h-md"><text class="text-sm text-muted">No actions</text></div>
	{/each}
</div>
