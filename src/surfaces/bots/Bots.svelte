<script lang="ts">
	import Avatar from '../../ui/Avatar.svelte';
	import Button from '../../ui/Button.svelte';
	import FolderPicker from '../../ui/FolderPicker.svelte';
	import IconButton from '../../ui/IconButton.svelte';
	import { botList, bots_ui, create, editor, selectBot, sessionCount } from './state.svelte.ts';

	// The Bots explorer: every bot with its avatar, role and session count. Selecting one opens the
	// editor; + creates one. New bots live in the shared botroom unless you choose a folder.
	let creating = $state(false);
	let name = $state('');
	let workspace = $state('');
	let picking = $state(false);

	async function submit() {
		if (await create(name, workspace)) {
			creating = false;
			name = '';
			workspace = '';
		}
	}
	const list = $derived(botList());
</script>

<div class="box gap-sm pad-md scroll-y" testId="surface-bots">
	<div class="row ycenter xbetween gap-sm">
		<text class="wb-label">Bots</text>
		<IconButton icon="plus" testId="bots-new" onclick={() => (creating = !creating)} />
	</div>

	{#if creating}
		<div class="box gap-xs" testId="bots-create">
			<input class="input" testId="bots-name" placeholder="Name" autofocus value={name} onchange={(e: { value: string }) => (name = e.value)} onsubmit={() => void submit()} />
			<div class="box gap-xs" testId="bots-workspace">
				<text class="text-xs text-muted truncate" testId="bots-workspace-path">{workspace || 'Workspace: its own botroom folder'}</text>
				<div class="row gap-sm">
					<Button label="Choose folder" testId="bots-workspace-choose" onclick={() => (picking = true)} />
					{#if workspace}<Button label="Use botroom" variant="ghost" testId="bots-workspace-reset" onclick={() => (workspace = '')} />{/if}
				</div>
			</div>
			{#if editor.error}<text class="text-xs text-danger" testId="bots-error">{editor.error}</text>{/if}
			<div class="row gap-sm">
				<Button label="Create" variant="primary" testId="bots-create-go" onclick={() => void submit()} />
				<Button label="Cancel" variant="ghost" testId="bots-create-cancel" onclick={() => (creating = false)} />
			</div>
		</div>
	{/if}

	{#each list as b (b.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="wb-row-item row ycenter gap-sm" class:active={bots_ui.selected === b.id} hitbox="self" testId={`bot-${b.id}`} onclick={() => selectBot(b.id, true)}>
			<Avatar id={b.id} name={b.bot.identity.name} avatar={b.bot.avatar} />
			<div class="box grow min0">
				<text class="nav-section-title truncate">{b.bot.identity.name}</text>
				<text class="nav-section-small truncate">{b.bot.archived ? 'archived · ' : ''}{sessionCount(b.id)} session{sessionCount(b.id) === 1 ? '' : 's'}</text>
			</div>
		</div>
	{:else}
		{#if !creating}<text class="text-sm text-muted" testId="bots-empty">{editor.notice || 'No bots yet. Create one with +.'}</text>{/if}
	{/each}
	{#if editor.notice && list.length}<text class="text-xs text-muted" testId="bots-notice">{editor.notice}</text>{/if}
</div>
{#if picking}
	<FolderPicker
		initial={workspace || undefined}
		title="Workspace folder"
		onchoose={(path) => {
			workspace = path;
			picking = false;
		}}
		onclose={() => (picking = false)}
		testId="bots-picker"
	/>
{/if}
