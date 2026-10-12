<script lang="ts">
	import AgentPanel from './AgentPanel.svelte';
	import { ensureActive, mainChat, uiReady } from './session.svelte.ts';

	// Home and Tools: the panel mirrors the main session (shared instance, one subscription).
	$effect(() => {
		void ensureActive();
	});
</script>

{#if uiReady.current}
	<AgentPanel chat={mainChat()} />
{/if}
