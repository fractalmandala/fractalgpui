<script lang="ts">
	import { sessionMeta } from '../../kernel/pi/sessions.svelte.ts';
	import Tabs from '../../ui/Tabs.svelte';
	import Composer from './Composer.svelte';
	import Transcript from './Transcript.svelte';
	import { active, ensureActive, mainChat, selectSession, uiReady } from './session.svelte.ts';

	$effect(() => {
		void ensureActive();
	});

	// The chat view: the open sessions as a tab row, the shown session's transcript above,
	// its composer docked below.
	const tabs = $derived(active.surface.map((id) => ({ id, label: sessionMeta(id)?.title ?? 'Session' })));
</script>

{#if uiReady.current}
	<div class="box full min0" testId="surface-agents-body">
		{#if tabs.length > 0}
			<div class="bb"><Tabs {tabs} value={active.surface[0] ?? ''} onchange={(id) => void selectSession(id)} testId="surface-tabs" /></div>
		{/if}
		<Transcript chat={mainChat()} />
		<Composer chat={mainChat()} />
	</div>
{/if}
