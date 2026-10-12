<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import type { AgentChat } from './session.svelte.ts';
	import Icon from '../../ui/Icon.svelte';
	import IconButton from '../../ui/IconButton.svelte';
	import { copy_text } from '../../kernel/clipboard.ts';
	import { flash } from '../../kernel/status.svelte.ts';
	import { renameSession, sessionMeta, sessionWorkspace } from '../../kernel/pi/sessions.svelte.ts';

	let { chat }: { chat: AgentChat } = $props();

	// The session transcript (§8): titled header, rich tool and approval
	// rows, collapsible thinking, follow + jump-to-latest, empty state.
	let expandedThinking = $state<Record<number, boolean>>({});
	let expandedDetail = $state<Record<number, boolean>>({});
	import { renameRequest } from './panels.svelte.ts';
	let following = $state(true);
	let editingTitle = $state(false);
	let titleDraft = $state('');

	$effect(() => {
		if (renameRequest.chat === chat.key) {
			titleDraft = title();
			editingTitle = true;
			renameRequest.chat = null;
		}
	});

	const title = () => sessionMeta(chat.key)?.title ?? 'Session';
	const workspace = () => sessionWorkspace(chat.key) ?? null;

	const summary = (detail: string, i: number) => {
		if (detail.length <= 200 || expandedDetail[i]) return detail;
		return `${detail.slice(0, 200)}… (${detail.length - 200} more characters)`;
	};

	async function commitTitle() {
		const clean = titleDraft.trim();
		if (!clean) return;
		try {
			await renameSession(Number(chat.key), clean);
			editingTitle = false;
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}
</script>

<div class="box grow min0">
	<div class="row ycenter gap-sm px-md shrink-0" testId="ag-tr-head">
		{#if editingTitle}
			<input
				class="input grow min0"
				testId="ag-title-input"
				value={titleDraft}
				autofocus
				onchange={(e: { value: string }) => (titleDraft = e.value)}
				onsubmit={commitTitle}
				onkeydown={(e: { key?: string }) => {
					if ((e.key ?? '').toLowerCase() === 'escape') editingTitle = false;
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<text
				class="text-md weight-600 text-primary grow min0 truncate"
				hitbox="self"
				testId="ag-title"
				onclick={() => {
					titleDraft = title();
					editingTitle = true;
				}}
			>
				{title()}
			</text>
		{/if}
		<text class="text-xs text-muted shrink-0">{workspace() ?? 'No folder'}</text>
	</div>
	<div
		class="box grow min0 gap-md pad-md scroll-y"
		testId="ag-transcript"
		onscroll={() => {
			following = false;
		}}
	>
		{#each chat.rows as row, i (i)}
			{#if row.kind === 'user'}
				<div class="row">
					<div class="grow"></div>
					<div class="wb-ag-user min0" testId={`ag-row-${i}`}><text>{row.text}</text></div>
				</div>
			{:else if row.kind === 'thinking'}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="box gap-xs" hitbox="self" testId={`ag-row-${i}`} onclick={() => (expandedThinking[i] = !expandedThinking[i])}>
					<div class="row ycenter gap-xs">
						<Icon name={expandedThinking[i] ? 'chevron-down' : 'chevron-right'} tone="muted" />
						<text class="wb-ag-thinking grow min0" class:truncate={!expandedThinking[i]}>
							{expandedThinking[i] ? row.text : (row.text.split('\n')[0] ?? 'Thinking')}
						</text>
					</div>
				</div>
			{:else if row.kind === 'assistant'}
				<text class="text-md text-primary" testId={`ag-row-${i}`}>{row.text}</text>
			{:else if row.kind === 'code'}
				<div class="box grow min0 sunken border radius-sm pad-sm scroll-x scroll-y">
					<div class="row ycenter gap-xs"><div class="grow"></div><IconButton icon="copy" testId={`ag-copy-${i}`} onclick={() => copy_text(row.code)} /></div>
					<code class="wb-code text-primary shrink-0" testId={`ag-row-${i}`} code={row.code} language={row.language}></code>
				</div>
			{:else if row.kind === 'tool'}
				<div class="box gap-xs" testId={`ag-row-${i}`}>
					<div class="row ycenter gap-sm">
						<text class="text-sm text-muted">›</text>
						<text class="text-sm text-secondary" class:text-danger={row.failed}>{row.label}</text>
						{#if row.failed}<text class="text-xs text-danger">failed</text>{/if}
					</div>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div hitbox="self" testId={`ag-tool-${i}`} onclick={() => (expandedDetail[i] = !expandedDetail[i])}>
						<code class="wb-code text-secondary" code={summary(row.detail, i)} language="text"></code>
					</div>
				</div>
			{:else if row.kind === 'approval'}
				<div class="box gap-xs sunken border radius-sm pad-sm" testId={`ag-row-${i}`}>
					<text class="text-sm text-primary">{row.summary}</text>
					<code class="wb-code text-secondary" code={row.detail} language="text"></code>
					{#if row.status === 'pending'}
						<div class="row ycenter gap-xs">
							<Button label="Approve" variant="primary" testId={`ag-approve-${row.callId}`} onclick={() => void chat.decide(row.callId, 'approved')} />
							<Button label="Deny" variant="ghost" testId={`ag-deny-${row.callId}`} onclick={() => void chat.decide(row.callId, 'denied')} />
						</div>
					{:else}
						<text class="text-xs text-muted">{row.status}</text>
					{/if}
				</div>
			{:else}
				<div class="row xcenter"><text class="text-xs text-muted" testId={`ag-row-${i}`}>{row.text}</text></div>
			{/if}
		{/each}
		{#if chat.noticeText}
			<div class="row xcenter"><text class="text-xs text-muted" testId="ag-notice">{chat.noticeText}</text></div>
		{/if}
		{#if chat.error}
			<div class="row xcenter"><text class="text-xs text-danger" testId="ag-row-error">{chat.error}</text></div>
		{/if}
		{#if !chat.rows.length && !chat.busy}
			<div class="row xcenter"><text class="text-sm text-muted">Send a message to start.</text></div>
		{/if}
		{#if chat.busy}
			<text class="text-sm text-muted" testId="ag-working">working…</text>
		{/if}
		{#if !following}
			<div class="row xcenter">
				<Button label="Jump to latest" variant="ghost" testId="ag-jump" onclick={() => (following = true)} />
			</div>
		{/if}
	</div>
</div>
