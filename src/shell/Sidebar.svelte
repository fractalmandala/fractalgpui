<script lang="ts">
	import { reset_width, set_width, toggle, type SurfaceRegion } from '../kernel/layout.svelte.ts';
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';
	import Splitter from '../ui/Splitter.svelte';

	// section-sidebar-panel / section-sidebar-right: a header (the surface's header, if
	// any, and a collapse button) and a body (the surface's, if any), with a splitter on
	// the left edge. An empty container unless the active surface fills it.
	let { region, width }: { region: SurfaceRegion; width: number } = $props();

	const surface = $derived(active_surface());
	const Header = $derived(surface.sections?.[region]?.header);
	const Body = $derived(surface.sections?.[region]?.body);
</script>

<!-- Static class names (the style check scans them), one per section. -->
<div
	class="box hfull panel bl"
	class:section-sidebar-panel={region === 'sidebar-panel'}
	class:section-sidebar-right={region === 'sidebar-right'}
	style={`width: ${width}px`}
	testId={`section-${region}`}
>
	<div
		class="row ycenter xbetween gap-sm px-md bb"
		class:section-sidebar-panel-header={region === 'sidebar-panel'}
		class:section-sidebar-right-header={region === 'sidebar-right'}
	>
		<div class="row ycenter grow min0">{#if Header}<Header />{/if}</div>
		<IconButton icon="x" testId={`${region}-collapse`} onclick={() => toggle(region, surface)} />
	</div>
	<div
		class="box grow min0 scroll-y"
		class:section-sidebar-panel-body={region === 'sidebar-panel'}
		class:section-sidebar-right-body={region === 'sidebar-right'}
		testId={`section-${region}-body`}
	>{#if Body}<Body />{/if}</div>
	<Splitter
		edge="left"
		{width}
		testId={`${region}-splitter`}
		onresize={(w) => set_width(region, surface, w)}
		onreset={() => reset_width(region, surface)}
	/>
</div>
