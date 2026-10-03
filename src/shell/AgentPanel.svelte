<script lang="ts">
	import { active_surface } from '../kernel/surfaces.svelte.ts';
	import Button from '../ui/Button.svelte';
	import Icon from '../ui/Icon.svelte';
	import Pill from '../ui/Pill.svelte';

	// The shared agent panel. UI only: the backend is undecided, so sending is disabled
	// and the panel says so. Surfaces can replace the body via their manifest's `agent`.
	const tool = $derived(active_surface());
	let draft = $state('');
</script>

<div class="box full min0">
	<div class="box grow min0 xcenter ycenter gap-sm pad-lg" testId="agent-empty">
		<div class="wb-glyph row xcenter ycenter radius-md"><Icon name="sparkles" tone="secondary" /></div>
		<text class="text-sm weight-600 text-primary">Ask about {tool.title}</text>
		<text class="text-sm text-muted ta-c">The agent will see this surface's input and output. No backend is connected yet.</text>
	</div>
	<div class="box gap-sm pad-sm bt">
		<div class="row ycenter gap-xs">
			<Pill label={tool.title} tone="outline" />
			<Pill label="Not connected" />
		</div>
		<textarea
			class="wb-editor wb-composer border radius-md pad-sm text-sm"
			testId="agent-input"
			placeholder="Message the agent…"
			minRows={2}
			maxRows={6}
			value={draft}
			onchange={(e: { value: string }) => (draft = e.value)}
		></textarea>
		<div class="row ycenter xbetween">
			<text class="text-xs text-muted">⏎ newline · send is disabled</text>
			<Button label="Send" icon="send" variant="primary" testId="agent-send" onclick={() => {}} />
		</div>
	</div>
</div>
