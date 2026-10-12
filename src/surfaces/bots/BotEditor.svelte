<script lang="ts">
	import { untrack } from 'svelte';
	import Avatar from '../../ui/Avatar.svelte';
	import Button from '../../ui/Button.svelte';
	import Tabs from '../../ui/Tabs.svelte';
	import Activity from './sections/Activity.svelte';
	import Capabilities from './sections/Capabilities.svelte';
	import Character from './sections/Character.svelte';
	import Identity from './sections/Identity.svelte';
	import Json from './sections/Json.svelte';
	import Memory from './sections/Memory.svelte';
	import Models from './sections/Models.svelte';
	import Roles from './sections/Roles.svelte';
	import { showValue } from './draft.ts';
	import {
		bots_ui,
		cancelReview,
		chatWith,
		confirmSave,
		dirty,
		duplicate,
		editor,
		pendingPatch,
		remove,
		reviewSave,
		revert,
		SECTIONS,
		selectedBot,
		sessionCount,
		syncDraft
	} from './state.svelte.ts';

	// The Bot editor: identity header, a tab per section, and a save bar. Nothing is written until
	// you review the diff and confirm.
	const sel = $derived(selectedBot());
	const changes = $derived(Object.keys(pendingPatch()).length);
	const section = $derived(SECTIONS.some((s) => s.id === bots_ui.section) ? bots_ui.section : 'character');

	$effect(() => {
		void sel; // re-sync only when the selection or the saved bot changes, not when the draft is edited
		untrack(syncDraft);
	});
</script>

<div class="box full min0" testId="surface-bots-editor">
	{#if !sel}
		<div class="box grow min0 xcenter ycenter gap-sm pad-md" testId="be-empty">
			<text class="text-sm text-muted">{editor.notice || 'Select a bot to edit it, or create one in the Bots list.'}</text>
		</div>
	{:else}
		<div class="row ycenter gap-md pad-md bb">
			<Avatar id={sel.id} name={sel.bot.identity.name} avatar={sel.bot.avatar} large testId="be-avatar" />
			<div class="box grow min0">
				<text class="text-md weight-600 text-primary truncate" testId="be-name">{sel.bot.identity.name}</text>
				<text class="text-xs text-muted truncate">{sel.bot.identity.role} · {sessionCount(sel.id)} session{sessionCount(sel.id) === 1 ? '' : 's'}</text>
			</div>
			<div class="row ycenter gap-xs shrink-0">
				<Button label="New chat" variant="primary" testId="be-chat" onclick={() => void chatWith(sel.id)} />
				<Button label="Duplicate" testId="be-duplicate" onclick={() => void duplicate(sel.id)} />
				<Button label="Delete" variant="danger" testId="be-delete" onclick={() => (editor.confirmDelete = true)} />
			</div>
		</div>

		{#if editor.confirmDelete}
			<div class="box gap-xs pad-md bb" testId="be-delete-confirm">
				<text class="text-sm text-primary">
					Delete {sel.bot.identity.name}? Its {sessionCount(sel.id)} session{sessionCount(sel.id) === 1 ? '' : 's'} will be kept as plain sessions. The bot's folder and workspace files stay on disk.
				</text>
				<div class="row gap-sm">
					<Button label="Delete bot" variant="danger" testId="be-delete-yes" onclick={() => void remove(sel.id)} />
					<Button label="Cancel" variant="ghost" testId="be-delete-no" onclick={() => (editor.confirmDelete = false)} />
				</div>
			</div>
		{/if}

		<div class="bb">
			<Tabs tabs={SECTIONS} value={section} onchange={(id) => (bots_ui.section = id)} testId="be-tabs" />
		</div>

		<div class="box grow min0 pad-md scroll-y" testId="be-body">
			{#if section === 'identity'}<Identity />
			{:else if section === 'character'}<Character />
			{:else if section === 'roles'}<Roles />
			{:else if section === 'capabilities'}<Capabilities />
			{:else if section === 'models'}<Models />
			{:else if section === 'memory'}<Memory />
			{:else if section === 'activity'}<Activity />
			{:else}<Json />{/if}
		</div>

		{#if editor.error}
			<div class="px-md py-sm bt"><text class="text-sm text-danger" testId="be-error">{editor.error}</text></div>
		{/if}

		{#if editor.preview}
			<div class="box gap-xs pad-md bt" testId="be-diff">
				<text class="wb-label">Review changes</text>
				{#each editor.preview as d (d.path)}
					<div class="row gap-sm" testId={`be-diff-${d.path}`}>
						<text class="text-xs text-primary shrink-0">{d.path}</text>
						<text class="text-xs text-danger grow min0 truncate">{showValue(d.before)}</text>
						<text class="text-xs text-muted shrink-0">→</text>
						<text class="text-xs text-success grow min0 truncate">{showValue(d.after)}</text>
					</div>
				{:else}
					<text class="text-xs text-muted">No effective changes.</text>
				{/each}
				<div class="row gap-sm">
					<Button label="Confirm save" variant="primary" testId="be-confirm" onclick={() => void confirmSave()} />
					<Button label="Back" variant="ghost" testId="be-back" onclick={cancelReview} />
				</div>
			</div>
		{:else if dirty()}
			<div class="row ycenter xbetween gap-sm pad-md bt" testId="be-savebar">
				<text class="text-sm text-secondary" testId="be-count">{changes} unsaved section{changes === 1 ? '' : 's'}</text>
				<div class="row gap-sm">
					<Button label="Revert" variant="ghost" testId="be-revert" onclick={revert} />
					<Button label="Save…" variant="primary" testId="be-save" onclick={() => void reviewSave()} />
				</div>
			</div>
		{/if}
	{/if}
</div>
