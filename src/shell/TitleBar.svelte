<script lang="ts">
	import { toggle } from '../kernel/layout.svelte.ts';
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';

	// The main area's 44px header: surface title, its toolbar, and the two right-container toggles.
	let { rightA, rightB }: { rightA: boolean; rightB: boolean } = $props();

	const tool = $derived(active_surface());
	const Toolbar = $derived(tool.toolbar);
</script>

<div class="wb-titlebar row ycenter xbetween gap-md px-md bb" testId="titlebar">
	<div class="row ycenter gap-sm min0">
		<text class="text-md weight-600 text-primary shrink-0" testId="surface-title">{tool.title}</text>
		<text class="text-sm text-muted truncate">{tool.description}</text>
	</div>
	<div class="row ycenter gap-xs shrink-0">
		{#if Toolbar}<Toolbar />{/if}
		<IconButton icon="panel-right" active={rightA} testId="toggle-rightA" onclick={() => toggle('rightA')} />
		<IconButton icon="panel-right" active={rightB} testId="toggle-rightB" onclick={() => toggle('rightB')} />
	</div>
</div>
