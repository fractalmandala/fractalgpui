<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import FolderPicker from '../../../ui/FolderPicker.svelte';
	import Toggle from '../../../ui/Toggle.svelte';
	import { selectedBot, editor } from '../state.svelte.ts';

	// The bot's workspace: its botroom folder unless a folder is assigned here (saved with Save, like the rest).
	let picking = $state(false);
	const botroom = $derived(selectedBot()?.bot.workspace ?? '');

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
		<div class="box gap-xs" testId="cap-workspace">
			<text class="wb-label">Workspace folder</text>
			<text class="text-sm text-primary truncate" testId="cap-workspace-path">{editor.draft.workspace || `${botroom || 'its botroom'} (botroom)`}</text>
			<div class="row gap-sm">
				<Button label="Choose folder" testId="cap-workspace-choose" onclick={() => (picking = true)} />
				{#if editor.draft.workspace}<Button label="Use botroom" variant="ghost" testId="cap-workspace-reset" onclick={() => editor.draft && (editor.draft.workspace = '')} />{/if}
			</div>
		</div>
	</div>
	{#if picking}
		<FolderPicker
			initial={editor.draft.workspace || undefined}
			title="Workspace folder"
			onchoose={(path) => {
				if (editor.draft) editor.draft.workspace = path;
				picking = false;
			}}
			onclose={() => (picking = false)}
			testId="cap-picker"
		/>
	{/if}
{/if}
