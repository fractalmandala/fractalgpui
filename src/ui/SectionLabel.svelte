<script lang="ts">
	import type { Snippet } from 'svelte';

	// Small muted heading above a group; optional trailing content (a count, an action).
	let { label, children }: { label: string; children?: Snippet } = $props();
</script>

<div class="row ycenter xbetween gap-sm">
	<text class="wb-label">{label}</text>
	{#if children}{@render children()}{/if}
</div>
