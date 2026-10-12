<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import { open_view } from '../../kernel/dock/dock.svelte.ts';

	// Models, providers, keys and usage now have their own view (it can be docked beside the chat).
</script>

<div class="box gap-md" testId="set-models">
	<text class="text-lg weight-600 text-primary">Models &amp; providers</text>
	<text class="text-sm text-secondary">Keeping models, provider keys, env-detected providers and usage live in their own view, so you can dock it next to your chat.</text>
	<div class="row"><Button label="Open Models & providers" variant="primary" testId="set-open-models" onclick={() => open_view('models')} /></div>
</div>
