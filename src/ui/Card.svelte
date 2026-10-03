<script lang="ts">
	import type { Snippet } from 'svelte';

	// A soft rounded card: raised surface, 1px border, 12px radius. Clickable when given `onclick`.
	let { children, onclick, testId }: { children: Snippet; onclick?: () => void; testId?: string } = $props();
</script>

{#if onclick}
	<div class="wb-card clickable box gap-xs" hitbox="self" {testId} {onclick}>{@render children()}</div>
{:else}
	<div class="wb-card box gap-xs" {testId}>{@render children()}</div>
{/if}
