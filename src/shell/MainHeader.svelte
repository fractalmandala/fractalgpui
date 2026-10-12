<script lang="ts">
	import { toggle } from '../kernel/layout.svelte.ts';
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';
	import Tabs from '../ui/Tabs.svelte';


	// section-main-header: the sidebar-left toggle, the surface's tabs in the dynamic
	// middle (Convert/Diff, output files…), then the surface toolbar and the
	// sidebar-panel / sidebar-right toggles. Surfaces never render their own header
	// rows: tabs and actions live here (see kernel/types.ts).
	let { left, panel, right }: { left: boolean; panel: boolean; right: boolean } = $props();

	const tool = $derived(active_surface());
	const Toolbar = $derived(tool.toolbar);
	const tabs = $derived(tool.tabs);
</script>

<div class="section-main-header row ycenter gap-md px-md bb" testId="section-main-header">
	<IconButton icon="panel-left" active={left} testId="toggle-sidebar-left" onclick={() => toggle('sidebar-left', tool)} />
	<div class="box grow min0">
		{#if tabs && tabs.list().length}
			<Tabs tabs={tabs.list()} value={tabs.value()} onchange={tabs.select} testId="surface-tabs" />
		{/if}
	</div>
	<div class="row ycenter gap-xs shrink-0">
		{#if Toolbar}<Toolbar />{/if}
		<IconButton icon={panel ? 'panel-agent-close' : 'panel-agent-open'} active={panel} testId="toggle-sidebar-panel" onclick={() => toggle('sidebar-panel', tool)} />
		<IconButton icon="panel-right" active={right} testId="toggle-sidebar-right" onclick={() => toggle('sidebar-right', tool)} />
	</div>
</div>
