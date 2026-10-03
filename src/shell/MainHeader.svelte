<script lang="ts">
	import { toggle } from '../kernel/layout.svelte.ts';
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';

	// section-main-header: surface title, its toolbar, and the sidebar-panel / sidebar-right toggles.
	let { panel, right }: { panel: boolean; right: boolean } = $props();

	const tool = $derived(active_surface());
	const Toolbar = $derived(tool.toolbar);
</script>

<div class="section-main-header row ycenter xbetween gap-md px-md bb" testId="section-main-header">
	<div class="row ycenter gap-sm min0">
		<text class="text-md weight-600 text-primary shrink-0" testId="surface-title">{tool.title}</text>
		<text class="text-sm text-muted truncate">{tool.description}</text>
	</div>
	<div class="row ycenter gap-xs shrink-0">
		{#if Toolbar}<Toolbar />{/if}
		<IconButton icon="panel-right" active={panel} testId="toggle-sidebar-panel" onclick={() => toggle('sidebar-panel', tool)} />
		<IconButton icon="panel-right" active={right} testId="toggle-sidebar-right" onclick={() => toggle('sidebar-right', tool)} />
	</div>
</div>
