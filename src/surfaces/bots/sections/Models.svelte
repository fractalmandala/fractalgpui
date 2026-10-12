<script lang="ts">
	import ModelPanel from '../../agents/ModelPanel.svelte';
	import { modelDefaults } from '../../../kernel/pi/models.ts';
	import Button from '../../../ui/Button.svelte';
	import { splitModel } from '../draft.ts';
	import { editor } from '../state.svelte.ts';

	// A bot's sessions each carry their own model (set in the chat); the default for new ones is in
	// Settings. What a bot owns is the model that summarises its memory: empty means "the session's
	// own model", or pick a cheaper or faster one here.
	const ref = $derived(editor.draft?.memory.summaryModel ?? '');
	const parts = $derived(splitModel(ref));
</script>

{#if editor.draft}
	<div class="box gap-md" testId="sec-models">
		<div class="box gap-xs">
			<text class="wb-label">New sessions start on</text>
			<text class="text-sm text-secondary" testId="mo-default">{modelDefaults.provider}/{modelDefaults.modelId}</text>
			<text class="text-xs text-muted">Change the default in Settings → Agent &amp; models; change one session's model from its chat.</text>
		</div>
		<div class="box gap-xs">
			<text class="wb-label">Memory model (summaries)</text>
			<text class="text-sm text-primary" testId="mo-summary">{ref || "Same as the session's model"}</text>
			<div class="row gap-sm">
				<Button label={editor.pickingModel ? 'Close picker' : 'Choose model…'} testId="mo-choose" onclick={() => (editor.pickingModel = !editor.pickingModel)} />
				{#if ref}<Button label="Use the session's model" variant="ghost" testId="mo-clear" onclick={() => editor.draft && (editor.draft.memory.summaryModel = '')} />{/if}
			</div>
		</div>
		{#if editor.pickingModel}
			<ModelPanel
				provider={parts?.provider ?? modelDefaults.provider}
				modelId={parts?.modelId ?? modelDefaults.modelId}
				testId="mo-panel"
				onselect={(p, m) => {
					if (editor.draft) editor.draft.memory.summaryModel = `${p}/${m}`;
					editor.pickingModel = false;
				}}
				onclose={() => (editor.pickingModel = false)}
			/>
		{/if}
	</div>
{/if}
