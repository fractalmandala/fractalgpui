<script lang="ts">
	import Toggle from '../../../ui/Toggle.svelte';
	import Field from '../Field.svelte';
	import { wholeNumber } from '../draft.ts';
	import { editor, selectedBot } from '../state.svelte.ts';

	// Memory posture and the profile. Memory spans all of this bot's sessions; the summary model is
	// chosen under Models.
	const sel = $derived(selectedBot());
	const num = (key: 'viewBudgetChars' | 'keepRecent' | 'fan' | 'profileCapBytes', min: number) => (v: string) => {
		if (editor.draft) editor.draft.memory[key] = wholeNumber(v, editor.draft.memory[key], min);
	};
</script>

{#if editor.draft && sel}
	<div class="box gap-md" testId="sec-memory">
		<Field label="Memory view size (characters)" testId="me-budget" value={String(editor.draft.memory.viewBudgetChars)} onchange={num('viewBudgetChars', 500)} />
		<Field label="Recent messages kept verbatim" testId="me-recent" value={String(editor.draft.memory.keepRecent)} onchange={num('keepRecent', 1)} />
		<Field label="Summary fan-in" testId="me-fan" value={String(editor.draft.memory.fan)} onchange={num('fan', 2)} />
		<Field label="Profile size cap (bytes)" testId="me-cap" value={String(editor.draft.memory.profileCapBytes)} onchange={num('profileCapBytes', 100)} />
		<Toggle
			label="Agent may commit profile facts without asking"
			testId="me-commit"
			checked={editor.draft.memory.agentMayCommitProfile}
			onchange={(on) => editor.draft && (editor.draft.memory.agentMayCommitProfile = on)}
		/>
		<div class="box gap-xs">
			<text class="wb-label">Profile ({sel.bot.profile.entries.length} facts{sel.bot.profile.proposals.length ? `, ${sel.bot.profile.proposals.length} proposed` : ''})</text>
			{#each sel.bot.profile.entries as e (e.key)}
				<text class="text-sm text-secondary" testId={`me-fact-${e.key}`}>{e.key}: {e.text}</text>
			{:else}
				<text class="text-xs text-muted">Nothing remembered yet.</text>
			{/each}
		</div>
	</div>
{/if}
