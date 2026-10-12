<script lang="ts" module>
	// Right-click guard (Slice 0 probe, D2): a right press arrives as `auxclick`
	// with `isRightClick: true`; `oncontextmenu` stays silent. Left clicks must
	// never open a menu — every site gates on this helper.
	export function isRightClick(e: { isRightClick?: unknown }): boolean {
		return e.isRightClick === true;
	}
</script>

<script lang="ts">
	import Menu, { type MenuItem } from './Menu.svelte';

	// A Menu opened by right-click or by an overflow `…` button, rendered
	// in flow directly under its trigger row.
	let {
		open,
		items,
		onselect,
		onclose,
		testId = 'ctx'
	}: {
		open: boolean;
		items: MenuItem[];
		onselect: (id: string) => void;
		onclose: () => void;
		testId?: string;
	} = $props();
</script>

{#if open}
	<Menu {items} onselect={(id) => onselect(id)} {onclose} {testId} />
{/if}
