<script lang="ts">
	import IconButton from '../../ui/IconButton.svelte';
	import Pill from '../../ui/Pill.svelte';
	import { ensureActive, mainChat, uiReady } from './session.svelte.ts';

	$effect(() => {
		void ensureActive();
	});
</script>

{#if uiReady.current}
	<Pill label={mainChat().modelId} />
	{#if mainChat().busy}
		<IconButton icon="x" testId="ag-stop-top" onclick={() => mainChat().stop()} />
	{/if}
{/if}
