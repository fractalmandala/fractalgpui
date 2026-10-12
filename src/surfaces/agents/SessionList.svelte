<script lang="ts">
	import Avatar from '../../ui/Avatar.svelte';
	import Button from '../../ui/Button.svelte';
	import ContextMenu, { isRightClick } from '../../ui/ContextMenu.svelte';
	import Icon from '../../ui/Icon.svelte';
	import IconButton from '../../ui/IconButton.svelte';
	import Modal from '../../ui/Modal.svelte';
	import type { MenuItem } from '../../ui/Menu.svelte';
	import { flash } from '../../kernel/status.svelte.ts';
	import { open_view } from '../../kernel/dock/dock.svelte.ts';
	import { orderSessions, sessionLabel, uniqueLabels, updatedLabel, type SessionView } from '../../kernel/pi/metadata.ts';
	import {
		assignSession,
		botIndex,
		index,
		renameSession,
		sessionMeta,
		setSessionArchived,
		setSessionPinned
	} from '../../kernel/pi/sessions.svelte.ts';
	import { active, branchSession, chats, deleteSession, ensureActive, newChatForBot, selectSession } from './session.svelte.ts';
	import { isCollapsed, PLAIN, setCollapsed, sidebarUi } from './history.svelte.ts';
	import { deleteAsk } from './panels.svelte.ts';

	// Bots and chats. Each bot (avatar, name) expands to ITS chats with a "New chat"; sessions that belong to
	// no bot sit under "Plain sessions". A bot's workspace is set in the bot editor, so there is no folder
	// list here.

	$effect(() => {
		void ensureActive();
	});

	$effect(() => {
		if (deleteAsk.id) {
			confirming = deleteAsk.id;
			deleteAsk.id = null;
		}
	});

	const tid = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '-');

	const allViews = (): SessionView[] => Object.entries(index.sessions).map(([id, meta]) => ({ id, meta }));
	const botOf = (v: SessionView) => (v.meta.botId && botIndex.bots[v.meta.botId] ? v.meta.botId : null);
	// A chat is archived when it is, or when its bot is: archived bots' chats live under Archived.
	const isArchived = (v: SessionView) => v.meta.archived || (!!v.meta.botId && !!botIndex.bots[v.meta.botId]?.archived);
	const live = $derived(allViews().filter((v) => !isArchived(v)));
	const bots = $derived(
		Object.entries(botIndex.bots)
			.filter(([, b]) => !b.archived)
			.map(([id, bot]) => ({ id, bot }))
			.sort((a, b) => a.bot.identity.name.localeCompare(b.bot.identity.name) || (a.id < b.id ? -1 : 1))
	);
	const inBot = (id: string) => orderSessions(live.filter((v) => botOf(v) === id));
	const plain = $derived(orderSessions(live.filter((v) => botOf(v) === null)));
	const archived = $derived(orderSessions(allViews().filter(isArchived)));

	const labels = $derived(uniqueLabels(allViews()));
	const labelOf = (id: string) => labels.get(id) ?? 'Chat';
	const isBusy = (id: string) => chats.get(id)?.busy ?? false;
	const groupBusy = (views: SessionView[]) => views.some((v) => isBusy(v.id));

	let menu = $state<string | null>(null);
	let editing = $state<string | null>(null);
	let draft = $state('');
	let confirming = $state<string | null>(null);
	let moving = $state<string | null>(null);

	const closeMenu = () => (menu = null);

	function sessionItems(id: string): MenuItem[] {
		const meta = sessionMeta(id);
		if (!meta) return [];
		return [
			{ id: 'rename', label: 'Rename', icon: 'pencil' },
			{ id: 'bot', label: 'Move to bot…', icon: 'bot' },
			{ id: 'pin', label: meta.pinned ? 'Unpin' : 'Pin', icon: 'pin' },
			{ id: 'archive', label: meta.archived ? 'Unarchive' : 'Archive', icon: 'archive' },
			{ id: 'branch', label: 'Branch from here', icon: 'git-fork' },
			{ id: 'delete', label: 'Delete…', icon: 'trash-2', danger: true }
		];
	}

	async function runSessionAction(id: string, item: string) {
		const meta = sessionMeta(id);
		closeMenu();
		if (!meta) return;
		try {
			if (item === 'rename') {
				draft = labelOf(id);
				editing = id;
			} else if (item === 'bot') moving = id;
			else if (item === 'pin') await setSessionPinned(Number(id), !meta.pinned);
			else if (item === 'archive') await setSessionArchived(Number(id), !meta.archived);
			else if (item === 'branch') await branchSession(id);
			else if (item === 'delete') confirming = id;
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function commitRename() {
		if (!editing) return;
		const clean = draft.trim();
		if (!clean) return;
		try {
			await renameSession(Number(editing), clean);
			editing = null;
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function commitDelete() {
		const id = confirming;
		if (!id) return;
		confirming = null;
		try {
			await deleteSession(id);
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function commitMove(botId: string | null) {
		const id = moving;
		moving = null;
		if (!id) return;
		try {
			await assignSession(Number(id), botId);
			flash(botId ? `Moved to ${botIndex.bots[botId]?.identity.name ?? 'the bot'}` : 'Now a plain session', 'success');
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function newChat(botId: string | null) {
		try {
			await newChatForBot(botId);
			open_view('chat');
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}
</script>

{#snippet sessionRow(v: SessionView)}
	<div
		class="wb-row-item row ycenter gap-sm"
		class:active={active.surface[0] === v.id}
		hitbox="self"
		testId={`hist-session-${v.id}`}
		onclick={() => void selectSession(v.id)}
		onauxclick={(e: { isRightClick?: unknown }) => {
			if (isRightClick(e)) menu = v.id;
		}}
	>
		{#if isBusy(v.id)}<div class="wb-live-dot"></div>{/if}
		<text class="nav-section-title grow min0 truncate" testId={`hist-session-${v.id}-title`}>{labelOf(v.id)}</text>
		<text class="nav-section-small shrink-0" testId={`hist-session-${v.id}-updated`}>{updatedLabel(v.meta.updatedAt)}</text>
		<IconButton icon="more-horizontal" testId={`hist-session-${v.id}-more`} onclick={() => (menu = menu === v.id ? null : v.id)} />
	</div>
	{#if editing === v.id}
		<input
			class="input"
			testId={`hist-session-${v.id}-rename`}
			value={draft}
			autofocus
			onchange={(e: { value: string }) => (draft = e.value)}
			onsubmit={commitRename}
			onkeydown={(e: { key?: string }) => {
				if ((e.key ?? '').toLowerCase() === 'escape') editing = null;
			}}
		/>
	{/if}
	{#if menu === v.id}
		<ContextMenu open items={sessionItems(v.id)} onselect={(item) => void runSessionAction(v.id, item)} onclose={closeMenu} testId={`hist-session-${v.id}-menu`} />
	{/if}
{/snippet}

<div class="box gap-sm pad-md scroll-y" testId="surface-sessions">
	{#each bots as { id, bot } (id)}
		{@const mine = inBot(id)}
		<div class="box gap-xs" testId={`hist-bot-${tid(id)}`}>
			<div class="wb-row-item row ycenter gap-sm">
				<div class="row ycenter gap-sm grow min0" hitbox="self" testId={`hist-bot-${tid(id)}-toggle`} onclick={() => setCollapsed(id, !isCollapsed(id))}>
					<Icon name={isCollapsed(id) ? 'chevron-right' : 'chevron-down'} tone="muted" />
					<Avatar {id} name={bot.identity.name} avatar={bot.avatar} />
					<text class="nav-section-title grow min0 truncate">{bot.identity.name}</text>
					{#if groupBusy(mine)}<div class="wb-live-dot"></div>{/if}
					<text class="nav-section-small shrink-0" testId={`hist-bot-${tid(id)}-count`}>{mine.length}</text>
				</div>
				<IconButton icon="plus" testId={`hist-bot-${tid(id)}-new`} onclick={() => void newChat(id)} />
			</div>
			{#if !isCollapsed(id)}
				{#each mine as v (v.id)}
					{@render sessionRow(v)}
				{:else}
					<text class="text-xs text-muted px-sm">No chats yet.</text>
				{/each}
			{/if}
		</div>
	{/each}

	{#if plain.length || !bots.length}
		<div class="box gap-xs" testId="hist-plain">
			<div class="wb-row-item row ycenter gap-sm">
				<div class="row ycenter gap-sm grow min0" hitbox="self" testId="hist-plain-toggle" onclick={() => setCollapsed(PLAIN, !isCollapsed(PLAIN))}>
					<Icon name={isCollapsed(PLAIN) ? 'chevron-right' : 'chevron-down'} tone="muted" />
					<Icon name="message-square" tone="secondary" />
					<text class="nav-section-title grow min0 truncate">Plain sessions</text>
					{#if groupBusy(plain)}<div class="wb-live-dot"></div>{/if}
					<text class="nav-section-small shrink-0">{plain.length}</text>
				</div>
				<IconButton icon="plus" testId="hist-plain-new" onclick={() => void newChat(null)} />
			</div>
			{#if !isCollapsed(PLAIN)}
				{#each plain as v (v.id)}
					{@render sessionRow(v)}
				{:else}
					<text class="text-xs text-muted px-sm">No plain sessions.</text>
				{/each}
			{/if}
		</div>
	{/if}

	{#if archived.length}
		<div class="box gap-xs">
			<div class="wb-row-item row ycenter gap-sm" hitbox="self" testId="hist-archived" onclick={() => (sidebarUi.showArchived = !sidebarUi.showArchived)}>
				<Icon name={sidebarUi.showArchived ? 'chevron-down' : 'chevron-right'} tone="muted" />
				<Icon name="archive" tone="secondary" />
				<text class="nav-section-title grow truncate">Archived</text>
				<text class="nav-section-small shrink-0">{archived.length}</text>
			</div>
			{#if sidebarUi.showArchived}
				{#each archived as v (v.id)}
					{@render sessionRow(v)}
				{/each}
			{/if}
		</div>
	{/if}
</div>

{#if moving}
	<Modal title="Move to bot" onclose={() => (moving = null)} testId="hist-move">
		<div class="box gap-xs">
			{#each bots as { id, bot } (id)}
				<div class="wb-row-item row ycenter gap-sm" hitbox="self" testId={`hist-move-${tid(id)}`} onclick={() => void commitMove(id)}>
					<Avatar {id} name={bot.identity.name} avatar={bot.avatar} />
					<text class="nav-section-title grow min0 truncate">{bot.identity.name}</text>
					{#if sessionMeta(moving)?.botId === id}<Icon name="check" tone="muted" />{/if}
				</div>
			{/each}
			<div class="wb-row-item row ycenter gap-sm" hitbox="self" testId="hist-move-none" onclick={() => void commitMove(null)}>
				<Icon name="message-square" tone="secondary" />
				<text class="nav-section-title grow min0 truncate">No bot (plain session)</text>
				{#if !sessionMeta(moving)?.botId}<Icon name="check" tone="muted" />{/if}
			</div>
		</div>
	</Modal>
{/if}

{#if confirming}
	<Modal title="Delete this chat?" onclose={() => (confirming = null)} testId="hist-delete" footer={deleteFoot}>
		<text class="text-sm text-primary">{labelOf(confirming)} and its messages will be removed. This cannot be undone.</text>
	</Modal>
{/if}

{#snippet deleteFoot()}
	<Button label="Cancel" variant="ghost" testId="hist-delete-cancel" onclick={() => (confirming = null)} />
	<Button label="Delete" variant="danger" testId="hist-delete-yes" onclick={commitDelete} />
{/snippet}
