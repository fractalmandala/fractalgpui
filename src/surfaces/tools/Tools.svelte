<script lang="ts">
	import Tabs from '../../ui/Tabs.svelte';
	import Sidebar from './Sidebar.svelte';
	import { active_tool } from './state.svelte.ts';

	// The Tools view: the tool list (and the selected tool's own sidebar) on the left of the pane,
	// then the tool: its tab row and toolbar above its body.
	const tool = $derived(active_tool());
	const Toolbar = $derived(tool.toolbar);
	const tabs = $derived(tool.tabs);
</script>

<div class="row full min0" testId="surface-tools">
	<div class="box min0 br scroll-y wb-side" testId="tool-side"><Sidebar /></div>
	<div class="box grow min0">
		{#if (tabs && tabs.list().length) || Toolbar}
			<div class="row ycenter xbetween gap-sm bb">
				<div class="box grow min0">
					{#if tabs && tabs.list().length}<Tabs tabs={tabs.list()} value={tabs.value()} onchange={tabs.select} testId="surface-tabs" />{/if}
				</div>
				{#if Toolbar}<div class="row ycenter gap-xs shrink-0 px-sm"><Toolbar /></div>{/if}
			</div>
		{/if}
		<div class="box grow min0" testId={`tool-${tool.id}`}>
			<tool.component />
		</div>
	</div>
</div>
