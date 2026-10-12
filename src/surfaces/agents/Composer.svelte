<script lang="ts" module>
	import { persisted } from '../../kernel/storage.svelte.ts';

	// Run-progress collapse per session id (§5.1: the state persists).
	export const progressUi = persisted('pi-progress-ui', { collapsed: {} as Record<string, boolean> });
</script>

<script lang="ts">
	import { flash } from '../../kernel/status.svelte.ts';
	import Button from '../../ui/Button.svelte';
	import Chip from '../../ui/Chip.svelte';
	import ContextGauge from '../../ui/ContextGauge.svelte';
	import FolderPicker from '../../ui/FolderPicker.svelte';
	import Icon from '../../ui/Icon.svelte';
	import Menu, { type MenuItem } from '../../ui/Menu.svelte';
	import { addProject, drafts, index, moveSession, sessionMeta } from '../../kernel/pi/sessions.svelte.ts';
	import { workspaceInfo } from '../../kernel/pi/workspace.ts';
	import type { AccessMode, AgentType } from '../../kernel/pi/metadata.ts';
	import type { AgentChat } from './session.svelte.ts';
	import { panelRequest } from './panels.svelte.ts';
	import ModelPanel from './ModelPanel.svelte';
	import ThinkingPanel from './ThinkingPanel.svelte';
	import UsagePopover from './UsagePopover.svelte';
	import WorkspaceRow from './WorkspaceRow.svelte';

	let { chat }: { chat: AgentChat } = $props();

	// The task bar (§2): type + access menus, workspace context, model and
	// thinking chips, gauge, run progress, per-session drafts (memory only).
	const draft = () => drafts[chat.key] ?? '';
	const setDraft = (v: string) => {
		drafts[chat.key] = v;
	};

	$effect(() => {
		const req = panelRequest.item;
		if (req && req.chat === chat.key) {
			panel = req.which;
			panelRequest.item = null;
		}
	});

	let panel = $state<null | 'model' | 'thinking' | 'usage'>(null);
	let typeMenu = $state(false);
	let accessMenu = $state(false);
	let folderOpen = $state(false);

	const TYPES: { id: AgentType; label: string; description: string; icon: 'compass' | 'wand-sparkles' | 'message-square' }[] = [
		{ id: 'plan', label: 'Plan', description: 'Explore and produce a plan; no changes', icon: 'compass' },
		{ id: 'build', label: 'Build', description: 'Do the work; make changes', icon: 'wand-sparkles' },
		{ id: 'ask', label: 'Ask', description: 'Answer questions; no changes', icon: 'message-square' }
	];
	const ACCESS: { id: AccessMode; label: string; description: string; icon: 'shield-check' | 'pencil' | 'sparkles' }[] = [
		{ id: 'supervised', label: 'Supervised', description: 'Ask before commands and file changes', icon: 'shield-check' },
		{ id: 'edits', label: 'Auto-accept edits', description: 'Auto-approve edits, ask before other actions', icon: 'pencil' },
		{ id: 'full', label: 'Full access', description: 'Allow commands and edits without prompts', icon: 'sparkles' }
	];

	const typeItems = (): MenuItem[] => TYPES.map((t) => ({ id: t.id, label: t.label, description: t.description, icon: t.icon, checked: chat.agentType === t.id }));
	const accessItems = (): MenuItem[] => ACCESS.map((a) => ({ id: a.id, label: a.label, description: a.description, icon: a.icon, checked: chat.access === a.id }));
	const typeLabel = () => TYPES.find((t) => t.id === chat.agentType)?.label ?? chat.agentType;
	const accessLabel = () => ACCESS.find((a) => a.id === chat.access)?.label ?? chat.access;

	const projectId = () => sessionMeta(chat.key)?.projectId ?? null;
	const project = () => {
		const pid = projectId();
		return pid ? index.projects[pid] : undefined;
	};
	const extraWorktrees = () => {
		const p = project();
		if (!p) return 0;
		try {
			return Math.max(0, workspaceInfo(p.path).worktrees - 1);
		} catch {
			return 0;
		}
	};

	const send = () => {
		const text = draft();
		setDraft('');
		void chat.send(text);
	};

	async function commitFolder(path: string) {
		try {
			const id = await addProject(path);
			await moveSession(Number(chat.key), id);
			folderOpen = false;
		} catch (err) {
			flash(`Could not use that folder: ${(err as Error).message}`, 'danger');
		}
	}

	const done = () => chat.todos.filter((t) => t.status === 'completed').length;
	const collapsed = () => progressUi.collapsed[chat.key] !== false;
	const figures = () => chat.usageSnapshot().context;
</script>

<div class="box gap-xs pad-md shrink-0" testId="ag-composer">
	{#if chat.todos.length}
		{@const total = chat.todos.length}
		{@const n = done()}
		<div class="box gap-xs" testId="ag-progress">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="row ycenter gap-sm"
				hitbox="self"
				testId="ag-progress-toggle"
				onclick={() => {
					const next = { ...progressUi.collapsed };
					if (collapsed()) delete next[chat.key];
					else next[chat.key] = true;
					progressUi.collapsed = next;
				}}
			>
				<Icon name="check" tone="accent" />
				<text class="text-sm text-secondary">{n}/{total} completed</text>
			</div>
			{#if !collapsed()}
				{#each chat.todos as todo (todo.text)}
					<div class="row ycenter gap-sm">
						{#if todo.status === 'completed'}<Icon name="check" tone="accent" />{:else}<text class="text-xs text-muted">○</text>{/if}
						<text class="text-sm text-secondary" class:text-muted={todo.status === 'pending'}>{todo.text}</text>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
	{#if panel === 'model'}
		<ModelPanel
			provider={chat.provider}
			modelId={chat.modelId}
			onselect={(p, m) => {
				chat.applyModel(p, m);
				panel = null;
			}}
			onclose={() => (panel = null)}
			testId="ag-model-panel"
		/>
	{:else if panel === 'thinking'}
		<ThinkingPanel chat={chat} onclose={() => (panel = null)} testId="ag-thinking-panel" />
	{:else if panel === 'usage'}
		<UsagePopover chat={chat} onclose={() => (panel = null)} testId="ag-usage" />
	{/if}
	<div class="wb-ag-composer">
		<textarea
			class="wb-editor border radius-sm pad-sm mono text-md"
			class:text-muted={!chat.keyOk && !chat.busy}
			testId="ag-input"
			placeholder="Message the agent…"
			minRows={3}
			maxRows={3}
			value={draft()}
			onchange={(e: { value: string }) => setDraft(e.value)}
			onsubmit={send}
		></textarea>
		<div class="row ycenter gap-sm pad-sm">
			<Chip label={chat.modelLabel()} icon="bot" testId="ag-model-chip" onclick={() => (panel = panel === 'model' ? null : 'model')} />
			<Chip label={chat.thinkingLevel ?? 'auto'} icon="brain" testId="ag-thinking-chip" onclick={() => (panel = panel === 'thinking' ? null : 'thinking')} />
			{#if figures()}
				<ContextGauge left={figures()?.left ?? 0} percent={figures()?.percent ?? 0} testId="ag-gauge" onclick={() => (panel = panel === 'usage' ? null : 'usage')} />
			{/if}
			<div class="grow"></div>
			{#if chat.busy}
				<Button label="Stop" testId="ag-stop" onclick={() => chat.stop()} />
			{:else}
				<Button label="↵ Send" variant="primary" testId="ag-send" onclick={send} />
			{/if}
		</div>
		<div class="row ycenter gap-sm pad-sm">
			<Chip label={typeLabel()} testId="ag-type" onclick={() => (typeMenu = !typeMenu)} />
			<Chip label={accessLabel()} testId="ag-access" onclick={() => (accessMenu = !accessMenu)} />
			<div class="grow"></div>
			{#if chat.busy}<text class="text-xs text-muted">working…</text>{/if}
		</div>
		{#if typeMenu}
			<Menu
				items={typeItems()}
				onselect={(id) => {
					chat.agentType = id as AgentType;
					typeMenu = false;
				}}
				onclose={() => (typeMenu = false)}
				testId="ag-type-menu"
			/>
		{/if}
		{#if accessMenu}
			<Menu
				items={accessItems()}
				onselect={(id) => {
					chat.access = id as AccessMode;
					accessMenu = false;
				}}
				onclose={() => (accessMenu = false)}
				testId="ag-access-menu"
			/>
		{/if}
		<div class="row ycenter gap-sm pad-sm">
			{#if project()}
				<WorkspaceRow path={project()?.path ?? ''} name={project()?.name} />
				{#if extraWorktrees() > 0}<text class="text-xs text-muted">{extraWorktrees()} more</text>{/if}
			{:else}
				<text class="text-sm text-muted">No folder</text>
				<Button label="Choose folder" variant="ghost" testId="ag-folder" onclick={() => (folderOpen = !folderOpen)} />
			{/if}
		</div>
		{#if folderOpen && !project()}
			<FolderPicker
				onchoose={commitFolder}
				onclose={() => (folderOpen = false)}
				testId="ag-picker"
			/>
		{/if}
		{#if chat.error}<text class="text-xs text-danger pad-sm" testId="ag-error">{chat.error}</text>{/if}
	</div>
</div>
