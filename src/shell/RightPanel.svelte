<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reset_width, set_width, toggle, type Region } from '../kernel/layout.svelte.ts';
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';
	import PanelHeader from '../ui/PanelHeader.svelte';
	import Splitter from '../ui/Splitter.svelte';

	// A right-hand sidebar (agent or inspector): header with close, body, and a splitter
	// on its left edge. Width is per surface (kernel/layout).
	let { region, title, width, children }: { region: Exclude<Region, 'left'>; title: string; width: number; children: Snippet } = $props();

	const id = $derived(active_surface().id);
</script>

<div class="wb-sidebar box hfull panel bl" style={`width: ${width}px`} testId={`${region}-panel`}>
	<PanelHeader {title}>
		{#snippet actions()}
			<IconButton icon="x" testId={`${region}-close`} onclick={() => toggle(region)} />
		{/snippet}
	</PanelHeader>
	<div class="box grow min0">{@render children()}</div>
	<Splitter
		edge="left"
		{width}
		testId={`${region}-splitter`}
		onresize={(w) => set_width(region, id, w)}
		onreset={() => reset_width(region, id)}
	/>
</div>
