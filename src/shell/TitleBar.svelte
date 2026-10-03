<script lang="ts">
	import { toggle } from '../kernel/layout.svelte.ts';
	import { active_tool } from '../kernel/tools.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';

	// The main area's 44px header: surface title, its toolbar, and the right-panel toggles
	// (shown only for panels the surface has).
	let { agent, inspector }: { agent: boolean; inspector: boolean } = $props();

	const tool = $derived(active_tool());
	const Toolbar = $derived(tool.toolbar);
</script>

<div class="wb-titlebar row ycenter xbetween gap-md px-md bb" testId="titlebar">
	<div class="row ycenter gap-sm min0">
		<text class="text-md weight-600 text-primary shrink-0" testId="surface-title">{tool.title}</text>
		<text class="text-sm text-muted truncate">{tool.description}</text>
	</div>
	<div class="row ycenter gap-xs shrink-0">
		{#if Toolbar}<Toolbar />{/if}
		{#if tool.agent !== false}
			<IconButton icon="bot" active={agent} testId="toggle-agent" onclick={() => toggle('agent')} />
		{/if}
		{#if tool.inspector}
			<IconButton icon="sliders-horizontal" active={inspector} testId="toggle-inspector" onclick={() => toggle('inspector')} />
		{/if}
	</div>
</div>
