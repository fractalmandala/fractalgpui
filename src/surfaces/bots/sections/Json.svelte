<script lang="ts">
	import { selectedBot } from '../state.svelte.ts';

	// The saved bot document, read-only (what is on disk, not the unsaved draft).
	const lines = $derived(selectedBot() ? JSON.stringify(selectedBot()!.bot, null, 2).split('\n').slice(0, 400) : []);
</script>

<div class="box" testId="sec-json">
	{#each lines as line, i (i)}<text class="wb-code text-secondary">{line}</text>{/each}
</div>
