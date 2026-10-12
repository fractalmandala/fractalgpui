<script lang="ts">
	import Icon from '../../ui/Icon.svelte';
	import { TOOLS } from './registry.ts';
	import { active_tool, select_tool } from './state.svelte.ts';

	// section-sidebar-left body: the tool list, then the selected tool's own sidebar.
	const current = $derived(active_tool());
	const ToolSidebar = $derived(current.sidebar);
</script>

<div class="box gap-sm pad-md" testId="tool-list">
	{#each TOOLS as t (t.id)}
		<div class="wb-nav-item row ycenter gap-sm" class:active={t.id === current.id} hitbox="self" testId={`tool-item-${t.id}`} onclick={() => select_tool(t.id)}>
			<Icon name={t.icon} tone={t.id === current.id ? 'primary' : 'secondary'} />
			<text class="grow min0 truncate">{t.title}</text>
		</div>
	{/each}
</div>
{#if ToolSidebar}
	<div class="box bt"><ToolSidebar /></div>
{/if}
