<script lang="ts">
	import Composer from './Composer.svelte';
	import Transcript from './Transcript.svelte';
	import { ensureActive, mainChat, uiReady } from './session.svelte.ts';

	$effect(() => {
		void ensureActive();
	});

	// The surface's shown tab: transcript above, composer docked below.
</script>

{#if uiReady.current}
	<div class="box full min0" testId="surface-agents-body">
		<Transcript chat={mainChat()} />
		<Composer chat={mainChat()} />
	</div>
{/if}
