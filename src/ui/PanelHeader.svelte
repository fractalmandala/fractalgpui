<script lang="ts">
	import type { Snippet } from 'svelte';

	// The 44px header row of a sidebar panel: a title and trailing actions.
	let { title, actions }: { title: string; actions?: Snippet } = $props();
</script>

<div class="wb-panel-header row ycenter xbetween gap-sm px-md bb">
	<text class="text-sm weight-600 text-primary truncate">{title}</text>
	{#if actions}<div class="row ycenter gap-xs">{@render actions()}</div>{/if}
</div>
