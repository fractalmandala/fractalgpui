<script lang="ts">
	import AgentPanel from './AgentPanel.svelte';
	import type { AgentChat } from './session.svelte.ts';
	import { panelChat } from './session.svelte.ts';

	// Agents surface: the panel carries a second session, created on first use.
	let peer = $state<AgentChat | null>(null);
	$effect(() => {
		void panelChat().then((c) => (peer = c));
	});
</script>

{#if peer}
	<AgentPanel chat={peer} />
{/if}
