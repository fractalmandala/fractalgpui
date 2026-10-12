<script lang="ts">
	import Toggle from '../../../ui/Toggle.svelte';
	import { editor } from '../state.svelte.ts';

	// What this bot's tools may do. Off means the tool is refused, not just hidden; destructive calls
	// still ask for approval whatever is on.
	const ROWS = [
		{ key: 'shell', label: 'Run shell commands', hint: 'bash' },
		{ key: 'fileWrite', label: 'Write and edit files', hint: 'write, edit' },
		{ key: 'browser', label: 'Use the browser', hint: 'browser tools' },
		{ key: 'agentEditsCharacter', label: 'Agent may edit its character', hint: 'character_edit' }
	] as const;
</script>

{#if editor.draft}
	<div class="box gap-md" testId="sec-capabilities">
		<text class="text-sm text-muted">Destructive actions always ask first, with every toggle on.</text>
		{#each ROWS as r (r.key)}
			<div class="box gap-xs">
				<Toggle
					label={r.label}
					testId={`cap-${r.key}`}
					checked={editor.draft.capabilities[r.key]}
					onchange={(on) => editor.draft && (editor.draft.capabilities[r.key] = on)}
				/>
				<text class="text-xs text-muted">{r.hint}</text>
			</div>
		{/each}
	</div>
{/if}
