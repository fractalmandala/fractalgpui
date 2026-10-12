<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import ContextMenu, { isRightClick } from '../../ui/ContextMenu.svelte';
	import Icon from '../../ui/Icon.svelte';
	import IconButton from '../../ui/IconButton.svelte';
	import FolderPicker from '../../ui/FolderPicker.svelte';
	import type { MenuItem } from '../../ui/Menu.svelte';
	import SectionLabel from '../../ui/SectionLabel.svelte';
	import { revealPath } from '../../kernel/reveal.ts';
	import { flash } from '../../kernel/status.svelte.ts';
	import { agentDbPath } from '../../kernel/pi/sessions-sql.ts';
	import { copy_text as copy } from '../../kernel/clipboard.ts';
	import { modelDefaults } from '../../kernel/pi/models.ts';
	import {
		classifyBucket,
		orderProjects,
		orderSessions,
		projectActivity,
		type ProjectView,
		type SessionView,
		type TimeBucket
	} from '../../kernel/pi/metadata.ts';
	import {
		active,
		branchSession,
		chats,
		deleteSession,
		ensureActive,
		newSession,
		selectSession
	} from './session.svelte.ts';
	import {
		addProject,
		createSession,
		index,
		moveSession,
		removeProject,
		renameProject,
		renameSession,
		sessionMeta,
		setProjectArchived,
		setProjectPinned,
		setSessionArchived,
		setSessionPinned
	} from '../../kernel/pi/sessions.svelte.ts';
	import { isCollapsed, setCollapsed, sidebarUi } from './history.svelte.ts';
	import WorkspaceRow from './WorkspaceRow.svelte';
	import { deleteAsk } from './panels.svelte.ts';

	// The history sidebar (§1): Sessions, Projects, Archived, Add project.
	// Replaces the old provider/model/keys panel (now in Settings, §7).

	$effect(() => {
		void ensureActive();
	});

	$effect(() => {
		if (deleteAsk.id) {
			confirming = { kind: 'session', id: deleteAsk.id };
			deleteAsk.id = null;
		}
	});

	const tid = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '-');

	const allViews = (): SessionView[] => Object.entries(index.sessions).map(([id, meta]) => ({ id, meta }));
	const strays = () => orderSessions(allViews().filter((v) => !v.meta.archived && !v.meta.projectId));
	const projects = (): ProjectView[] =>
		orderProjects(
			Object.entries(index.projects)
				.filter(([, m]) => !m.archived)
				.map(([id, meta]) => ({ id, meta, activity: projectActivity(id, allViews()) }))
		);
	const archivedProjects = (): ProjectView[] =>
		orderProjects(
			Object.entries(index.projects)
				.filter(([, m]) => m.archived)
				.map(([id, meta]) => ({ id, meta, activity: projectActivity(id, allViews()) }))
		);
	const archivedSessions = () => orderSessions(allViews().filter((v) => v.meta.archived));
	const inProject = (pid: string) => orderSessions(allViews().filter((v) => !v.meta.archived && v.meta.projectId === pid));

	const BUCKETS: { id: TimeBucket; label: string }[] = [
		{ id: 'today', label: 'Today' },
		{ id: 'yesterday', label: 'Yesterday' },
		{ id: 'previous14', label: 'Previous 14 days' },
		{ id: 'older', label: 'Older' }
	];
	const bucketsOf = (pid: string) => {
		const now = Date.now();
		return BUCKETS.map((b) => ({
			...b,
			views: inProject(pid).filter((v) => classifyBucket(v.meta.updatedAt, now) === b.id)
		})).filter((b) => b.views.length > 0);
	};

	const isOpen = (id: string) => active.surface.includes(id) || active.panel === id;
	const isBusy = (id: string) => chats.get(id)?.busy ?? false;
	const projectBusy = (pid: string) => inProject(pid).some((v) => isBusy(v.id));

	let menu = $state<{ kind: 'session' | 'project'; id: string } | null>(null);
	let moveFor = $state<string | null>(null);
	let editing = $state<{ kind: 'session' | 'project'; id: string } | null>(null);
	let draft = $state('');
	let confirming = $state<{ kind: 'session' | 'project'; id: string } | null>(null);
	let addDraft = $state('');
	let addError = $state<string | null>(null);
	let pickOpen = $state(false);
	let dragging = $state<string | null>(null);
	let dropTarget = $state<string | null>(null);

	const closeMenu = () => {
		menu = null;
		moveFor = null;
	};

	function sessionItems(id: string): MenuItem[] {
		const meta = sessionMeta(id);
		if (!meta) return [];
		if (moveFor === id) {
			return [
				{ id: 'back', label: 'Back', icon: 'chevron-right' },
				...projects().map((p) => ({ id: `move:${p.id}`, label: p.meta.name, icon: 'folder' as const })),
				{ id: 'move:', label: 'Sessions (no project)', icon: 'house' as const }
			];
		}
		return [
			{ id: 'rename', label: 'Rename', icon: 'pencil' },
			{ id: 'pin', label: meta.pinned ? 'Unpin' : 'Pin', icon: 'pin' },
			{ id: 'archive', label: meta.archived ? 'Unarchive' : 'Archive', icon: 'archive' },
			{ id: 'move', label: 'Move to', icon: 'folder' },
			{ id: 'branch', label: 'Branch from here', icon: 'git-fork' },
			{ id: 'copy-id', label: 'Copy session ID', icon: 'copy' },
			{ id: 'copy-path', label: 'Copy store path', icon: 'copy' },
			{ id: 'delete', label: 'Delete', icon: 'trash-2', danger: true }
		];
	}

	function projectItems(pid: string): MenuItem[] {
		const meta = index.projects[pid];
		if (!meta) return [];
		return [
			{ id: 'open', label: 'Open folder', icon: 'folder-open' },
			{ id: 'rename', label: 'Rename project', icon: 'pencil' },
			{ id: 'pin', label: meta.pinned ? 'Unpin project' : 'Pin project', icon: 'pin' },
			{ id: 'archive', label: meta.archived ? 'Unarchive project' : 'Archive project', icon: 'archive' },
			{ id: 'delete', label: 'Delete project', icon: 'trash-2', danger: true },
			{ id: 'close', label: 'Close', icon: 'x' }
		];
	}

	async function runSessionAction(id: string, item: string) {
		const meta = sessionMeta(id);
		if (!meta) return closeMenu();
		try {
			if (item === 'back') moveFor = null;
			else if (item === 'rename') {
				draft = meta.title;
				editing = { kind: 'session', id };
				closeMenu();
			} else if (item === 'pin') {
				await setSessionPinned(Number(id), !meta.pinned);
				closeMenu();
			} else if (item === 'archive') {
				await setSessionArchived(Number(id), !meta.archived);
				closeMenu();
			} else if (item === 'move') moveFor = id;
			else if (item.startsWith('move:')) {
				await moveSession(Number(id), item.slice(5) || null);
				closeMenu();
			} else if (item === 'branch') {
				await branchSession(id);
				closeMenu();
			} else if (item === 'copy-id') {
				copy(id);
				closeMenu();
			} else if (item === 'copy-path') {
				copy(agentDbPath());
				closeMenu();
			} else if (item === 'delete') {
				confirming = { kind: 'session', id };
				closeMenu();
			}
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}
	async function runProjectAction(pid: string, item: string) {
		const meta = index.projects[pid];
		if (!meta) return closeMenu();
		try {
			if (item === 'open') {
				if (!revealPath(meta.path)) flash(`Could not open ${meta.path}`, 'danger');
				closeMenu();
			} else if (item === 'rename') {
				draft = meta.name;
				editing = { kind: 'project', id: pid };
				closeMenu();
			} else if (item === 'pin') {
				await setProjectPinned(pid, !meta.pinned);
				closeMenu();
			} else if (item === 'archive') {
				await setProjectArchived(pid, !meta.archived);
				closeMenu();
			} else if (item === 'delete') {
				confirming = { kind: 'project', id: pid };
				closeMenu();
			} else closeMenu();
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function commitRename() {
		if (!editing) return;
		const clean = draft.trim();
		if (!clean) return;
		try {
			if (editing.kind === 'session') await renameSession(Number(editing.id), clean);
			else await renameProject(editing.id, clean);
			editing = null;
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function commitDelete() {
		if (!confirming) return;
		try {
			if (confirming.kind === 'session') await deleteSession(confirming.id);
			else await removeProject(confirming.id);
			confirming = null;
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	async function commitAddProject() {
		addError = null;
		try {
			const id = await addProject(addDraft);
			addDraft = '';
			setCollapsed(id, false);
		} catch (err) {
			addError = (err as Error).message;
		}
	}

	async function commitPick(path: string) {
		pickOpen = false;
		addError = null;
		try {
			const id = await addProject(path);
			setCollapsed(id, false);
		} catch (err) {
			addError = (err as Error).message;
		}
	}

	async function newInProject(pid: string | null) {
		try {
			const id = await createSession(pid, { provider: modelDefaults.provider, modelId: modelDefaults.modelId });
			await selectSession(String(id));
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}

	function startDrag(id: string, e: { button?: number }) {
		if ((e.button ?? 0) !== 0) return;
		dragging = id;
		dropTarget = null;
	}

	function endDrag() {
		if (dragging && dropTarget !== null) {
			const meta = sessionMeta(dragging);
			const target = dropTarget === '' ? null : dropTarget;
			if (meta && meta.projectId !== target) void moveSession(Number(dragging), target).catch((err) => flash(`That didn't work: ${(err as Error).message}`, 'danger'));
		}
		dragging = null;
		dropTarget = null;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="box gap-md pad-md scroll-y"
	testId="hist-list"
	onmouseup={endDrag}
	onmousemove={(e: { pressedButton?: number }) => {
		if (dragging && (e.pressedButton ?? 1) === 0) {
			dragging = null;
			dropTarget = null;
		}
	}}
>
	{#if strays().length}
		<div class="box gap-xs">
			<div class="row ycenter xbetween gap-sm px-sm">
				<SectionLabel label="Sessions" />
				<IconButton icon="plus" testId="hist-new" onclick={() => void newSession()} />
			</div>
			{#each strays() as v (v.id)}
				<div
					class="nav-section row ycenter gap-sm"
					class:active={active.surface[0] === v.id}
					class:wb-drop={dropTarget === '' && dragging !== null}
					hitbox="self"
					testId={`hist-session-${v.id}`}
					onclick={() => void selectSession(v.id)}
					onauxclick={(e: { isRightClick?: unknown }) => {
						if (isRightClick(e)) menu = { kind: 'session', id: v.id };
					}}
					onmousedown={(e: { button?: number }) => startDrag(v.id, e)}
					onmouseenter={() => {
						if (dragging) dropTarget = '';
					}}
				>
					{#if isOpen(v.id)}<text class="text-sm text-secondary">○</text>{/if}
					{#if isBusy(v.id)}<div class="wb-live-dot"></div>{/if}
					<text class="nav-section-title grow min0 truncate">{v.meta.title}</text>
					<IconButton
						icon="more-horizontal"
						testId={`hist-session-${v.id}-more`}
						onclick={() => (menu = menu?.id === v.id ? null : { kind: 'session', id: v.id })}
					/>
				</div>
				{#if editing?.kind === 'session' && editing.id === v.id}
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
				{#if confirming?.kind === 'session' && confirming.id === v.id}
					<div class="box gap-xs px-sm" testId={`hist-session-${v.id}-delete`}>
						<text class="text-sm text-primary">Delete this session?</text>
						<div class="row ycenter gap-xs">
							<Button label="Delete" variant="danger" testId={`hist-session-${v.id}-delete-yes`} onclick={commitDelete} />
							<Button label="Cancel" variant="ghost" onclick={() => (confirming = null)} />
						</div>
					</div>
				{/if}
				{#if menu?.kind === 'session' && menu.id === v.id}
					<ContextMenu
						open
						items={sessionItems(v.id)}
						onselect={(item) => void runSessionAction(v.id, item)}
						onclose={closeMenu}
						testId={`hist-session-${v.id}-menu`}
					/>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="box gap-xs">
		<div class="px-sm"><SectionLabel label="Projects" /></div>
		{#each projects() as p (p.id)}
			<div class="box gap-xs">
				<div
					class="nav-section row ycenter gap-sm"
					class:wb-drop={dropTarget === p.id && dragging !== null}
					hitbox="self"
					testId={`hist-project-${tid(p.id)}`}
					onclick={() => setCollapsed(p.id, !isCollapsed(p.id))}
					onauxclick={(e: { isRightClick?: unknown }) => {
						if (isRightClick(e)) menu = { kind: 'project', id: p.id };
					}}
					onmouseenter={() => {
						if (dragging) dropTarget = p.id;
					}}
					onmouseup={endDrag}
				>
					<Icon name={isCollapsed(p.id) ? 'chevron-right' : 'chevron-down'} tone="muted" />
					<Icon name="folder" tone="secondary" />
					<div class="box grow min0">
						<text class="nav-section-title truncate">{p.meta.name}</text>
						<WorkspaceRow path={p.meta.path} />
					</div>
					{#if projectBusy(p.id)}<div class="wb-live-dot"></div>{/if}
					<IconButton
						icon="more-horizontal"
						testId={`hist-project-${tid(p.id)}-more`}
						onclick={() => (menu = menu?.id === p.id ? null : { kind: 'project', id: p.id })}
					/>
					<IconButton icon="plus" testId={`hist-project-${tid(p.id)}-add`} onclick={() => void newInProject(p.id)} />
				</div>
				{#if editing?.kind === 'project' && editing.id === p.id}
					<input
						class="input"
						testId={`hist-project-${tid(p.id)}-rename`}
						value={draft}
						autofocus
						onchange={(e: { value: string }) => (draft = e.value)}
						onsubmit={commitRename}
						onkeydown={(e: { key?: string }) => {
							if ((e.key ?? '').toLowerCase() === 'escape') editing = null;
						}}
					/>
				{/if}
				{#if confirming?.kind === 'project' && confirming.id === p.id}
					<div class="box gap-xs px-sm" testId={`hist-project-${tid(p.id)}-delete`}>
						<text class="text-sm text-primary">Delete this project? Its sessions move to Sessions. No files are deleted.</text>
						<div class="row ycenter gap-xs">
							<Button label="Delete" variant="danger" testId={`hist-project-${tid(p.id)}-delete-yes`} onclick={commitDelete} />
							<Button label="Cancel" variant="ghost" onclick={() => (confirming = null)} />
						</div>
					</div>
				{/if}
				{#if menu?.kind === 'project' && menu.id === p.id}
					<ContextMenu
						open
						items={projectItems(p.id)}
						onselect={(item) => void runProjectAction(p.id, item)}
						onclose={closeMenu}
						testId={`hist-project-${tid(p.id)}-menu`}
					/>
				{/if}
				{#if !isCollapsed(p.id)}
					{#each bucketsOf(p.id) as bucket (bucket.id)}
						<div class="px-sm"><SectionLabel label={bucket.label} /></div>
						{#each bucket.views as v (v.id)}
							<div
								class="nav-section row ycenter gap-sm"
								class:active={active.surface[0] === v.id}
								hitbox="self"
								testId={`hist-session-${v.id}`}
								onclick={() => void selectSession(v.id)}
								onauxclick={(e: { isRightClick?: unknown }) => {
									if (isRightClick(e)) menu = { kind: 'session', id: v.id };
								}}
								onmousedown={(e: { button?: number }) => startDrag(v.id, e)}
							>
								{#if isOpen(v.id)}<text class="text-sm text-secondary">○</text>{/if}
								{#if isBusy(v.id)}<div class="wb-live-dot"></div>{/if}
								<text class="nav-section-title grow min0 truncate">{v.meta.title}</text>
								<IconButton
									icon="more-horizontal"
									testId={`hist-session-${v.id}-more`}
									onclick={() => (menu = menu?.id === v.id ? null : { kind: 'session', id: v.id })}
								/>
							</div>
							{#if editing?.kind === 'session' && editing.id === v.id}
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
							{#if confirming?.kind === 'session' && confirming.id === v.id}
								<div class="box gap-xs px-sm" testId={`hist-session-${v.id}-delete`}>
									<text class="text-sm text-primary">Delete this session?</text>
									<div class="row ycenter gap-xs">
										<Button label="Delete" variant="danger" testId={`hist-session-${v.id}-delete-yes`} onclick={commitDelete} />
										<Button label="Cancel" variant="ghost" onclick={() => (confirming = null)} />
									</div>
								</div>
							{/if}
							{#if menu?.kind === 'session' && menu.id === v.id}
								<ContextMenu
									open
									items={sessionItems(v.id)}
									onselect={(item) => void runSessionAction(v.id, item)}
									onclose={closeMenu}
									testId={`hist-session-${v.id}-menu`}
								/>
							{/if}
					{/each}
					{/each}
					{/if}
				</div>
			{/each}
			<div class="box gap-xs px-sm">
				<div class="row ycenter gap-xs">
					<input
						class="input grow min0"
						testId="hist-add-input"
						placeholder="Add project by folder path…"
						value={addDraft}
						onchange={(e: { value: string }) => (addDraft = e.value)}
						onsubmit={commitAddProject}
					/>
					<Button label="Add" testId="hist-add" onclick={commitAddProject} />
					<Button label="Browse" variant="ghost" testId="hist-browse" onclick={() => (pickOpen = true)} />
				</div>
				{#if addError}<text class="text-xs text-danger" testId="hist-add-error">{addError}</text>{/if}
			</div>
			{#if pickOpen}
				<FolderPicker onchoose={commitPick} onclose={() => (pickOpen = false)} testId="hist-picker" />
			{/if}
		</div>

	{#if archivedSessions().length || archivedProjects().length}
		<div class="box gap-xs">
			<div
				class="nav-section row ycenter gap-sm"
				hitbox="self"
				testId="hist-archived"
				onclick={() => (sidebarUi.showArchived = !sidebarUi.showArchived)}
			>
				<Icon name={sidebarUi.showArchived ? 'chevron-down' : 'chevron-right'} tone="muted" />
				<Icon name="archive" tone="secondary" />
				<text class="nav-section-title grow truncate">Archived</text>
			</div>
			{#if sidebarUi.showArchived}
				{#each archivedProjects() as p (p.id)}
					<div
						class="nav-section row ycenter gap-sm"
						hitbox="self"
						testId={`hist-project-${tid(p.id)}`}
						onclick={() => setCollapsed(p.id, !isCollapsed(p.id))}
						onauxclick={(e: { isRightClick?: unknown }) => {
							if (isRightClick(e)) menu = { kind: 'project', id: p.id };
						}}
					>
						<Icon name={isCollapsed(p.id) ? 'chevron-right' : 'chevron-down'} tone="muted" />
						<Icon name="folder" tone="secondary" />
						<text class="nav-section-title grow min0 truncate">{p.meta.name}</text>
						<IconButton
							icon="more-horizontal"
							testId={`hist-project-${tid(p.id)}-more`}
							onclick={() => (menu = menu?.id === p.id ? null : { kind: 'project', id: p.id })}
						/>
					</div>
					{#if menu?.kind === 'project' && menu.id === p.id}
						<ContextMenu
							open
							items={projectItems(p.id)}
							onselect={(item) => void runProjectAction(p.id, item)}
							onclose={closeMenu}
							testId={`hist-project-${tid(p.id)}-menu`}
						/>
					{/if}
					{#if !isCollapsed(p.id)}
						{#each inProject(p.id) as v (v.id)}
							<div
								class="nav-section row ycenter gap-sm"
								hitbox="self"
								testId={`hist-session-${v.id}`}
								onclick={() => void selectSession(v.id)}
								onauxclick={(e: { isRightClick?: unknown }) => {
									if (isRightClick(e)) menu = { kind: 'session', id: v.id };
								}}
							>
								<text class="nav-section-title grow min0 truncate">{v.meta.title}</text>
								<IconButton
									icon="more-horizontal"
									testId={`hist-session-${v.id}-more`}
									onclick={() => (menu = menu?.id === v.id ? null : { kind: 'session', id: v.id })}
								/>
							</div>
							{#if menu?.kind === 'session' && menu.id === v.id}
								<ContextMenu
									open
									items={sessionItems(v.id)}
									onselect={(item) => void runSessionAction(v.id, item)}
									onclose={closeMenu}
									testId={`hist-session-${v.id}-menu`}
								/>
							{/if}
						{/each}
					{/if}
				{/each}
				{#each archivedSessions() as v (v.id)}
					<div
						class="nav-section row ycenter gap-sm"
						hitbox="self"
						testId={`hist-session-${v.id}`}
						onclick={() => void selectSession(v.id)}
						onauxclick={(e: { isRightClick?: unknown }) => {
							if (isRightClick(e)) menu = { kind: 'session', id: v.id };
						}}
					>
						<text class="nav-section-title grow min0 truncate">{v.meta.title}</text>
						<IconButton
							icon="more-horizontal"
							testId={`hist-session-${v.id}-more`}
							onclick={() => (menu = menu?.id === v.id ? null : { kind: 'session', id: v.id })}
						/>
					</div>
					{#if menu?.kind === 'session' && menu.id === v.id}
						<ContextMenu
							open
							items={sessionItems(v.id)}
							onselect={(item) => void runSessionAction(v.id, item)}
							onclose={closeMenu}
							testId={`hist-session-${v.id}-menu`}
						/>
					{/if}
				{/each}
			{/if}
		</div>
	{/if}
</div>
