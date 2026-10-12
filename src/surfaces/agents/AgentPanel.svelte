<script lang="ts">
	import type { AgentChat } from './session.svelte.ts';
	import Composer from './Composer.svelte';
	import Transcript from './Transcript.svelte';


	// The agent region, secondary slot: the sidebar panel on every surface.
	// Takes whichever chat it hosts (primary elsewhere, second on agents).
	let { chat }: { chat: AgentChat } = $props();
</script>

<div class="box full min0" testId="agent-panel">
	<Transcript {chat} />
	<Composer {chat} />
</div>
