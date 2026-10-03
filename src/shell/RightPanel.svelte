<script lang="ts">
	import { reset_width, set_width, toggle, type RightRegion } from '../kernel/layout.svelte.ts';
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import type { PanelSlot } from '../kernel/types.ts';
	import IconButton from '../ui/IconButton.svelte';
	import Splitter from '../ui/Splitter.svelte';

	// A right-hand container: a header row (the surface's header, if any, and a close
	// button), the surface's body (if any), and a splitter on its left edge. Empty
	// unless the active surface fills it. Width is per surface (kernel/layout).
	let { region, slot, width }: { region: RightRegion; slot?: PanelSlot; width: number } = $props();

	const id = $derived(active_surface().id);
	const Header = $derived(slot?.header);
	const Body = $derived(slot?.body);
</script>

<div class="wb-sidebar box hfull panel bl" style={`width: ${width}px`} testId={`${region}-panel`}>
	<div class="wb-panel-header row ycenter xbetween gap-sm px-md bb">
		<div class="row ycenter grow min0">{#if Header}<Header />{/if}</div>
		<IconButton icon="x" testId={`${region}-close`} onclick={() => toggle(region)} />
	</div>
	<div class="box grow min0 scroll-y" testId={`${region}-body`}>{#if Body}<Body />{/if}</div>
	<Splitter
		edge="left"
		{width}
		testId={`${region}-splitter`}
		onresize={(w) => set_width(region, id, w)}
		onreset={() => reset_width(region, id)}
	/>
</div>
