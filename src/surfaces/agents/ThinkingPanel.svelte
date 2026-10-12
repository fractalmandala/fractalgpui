<script lang="ts">
	import { getSupportedThinkingLevels } from '@earendil-works/pi-ai/models';
	import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
	import { piModels } from '../../kernel/pi/harness.svelte.ts';
	import Icon from '../../ui/Icon.svelte';
	import type { AgentChat } from './session.svelte.ts';

	// The thinking picker (§3.4–§3.6): seven levels, cheapest first, with the
	// current one checked. Levels the session's model does not implement are
	// shown dimmed with the reason and are not selectable; the panel never
	// reassigns the level silently (the fallback lives in `applyModel`).
	let {
		chat,
		onclose,
		testId = 'thinking-panel'
	}: {
		chat: AgentChat;
		onclose: () => void;
		testId?: string;
	} = $props();

	const LEVELS: { id: ModelThinkingLevel; label: string; description: string }[] = [
		{ id: 'minimal', label: 'Minimal', description: 'Short answers, cheapest and fastest.' },
		{ id: 'low', label: 'Low', description: 'A little reasoning for simple tasks.' },
		{ id: 'medium', label: 'Medium', description: 'Balanced reasoning for everyday work.' },
		{ id: 'high', label: 'High', description: 'Deep reasoning for hard problems.' },
		{ id: 'xhigh', label: 'Xhigh', description: 'Extended reasoning when it matters most.' },
		{ id: 'max', label: 'Max', description: 'Everything the model can spend.' },
		{ id: 'off', label: 'Off', description: 'No thinking; direct answers only.' }
	];

	let highlight = $state(0);

	function supported(): ModelThinkingLevel[] | null {
		try {
			const model = piModels().getModel(chat.provider, chat.modelId);
			return model ? getSupportedThinkingLevels(model) : null;
		} catch {
			return null;
		}
	}

	function enabled(id: ModelThinkingLevel): boolean {
		const s = supported();
		return s === null || s.includes(id);
	}

	function key(e: { key?: string }) {
		const k = (e.key ?? '').toLowerCase();
		if (k === 'escape') return onclose();
		if (k === 'arrowdown' || k === 'arrowup') {
			const delta = k === 'arrowdown' ? 1 : -1;
			highlight = (highlight + delta + LEVELS.length) % LEVELS.length;
			return;
		}
		if (k === 'enter') {
			const level = LEVELS[highlight];
			if (level && enabled(level.id)) {
				chat.thinkingLevel = level.id;
				onclose();
			}
		}
	}
</script>
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-menu box gap-xs" {testId} hitbox="self" autofocus onkeydown={key} onmousedownoutside={onclose}>
	{#each LEVELS as level, i (level.id)}
		<div
			class="wb-palette-item box gap-xs px-sm radius-sm"
			class:active={i === highlight}
			hitbox="self"
			testId={`${testId}-row-${level.id}`}
			onclick={() => {
				if (enabled(level.id)) {
					chat.thinkingLevel = level.id;
					onclose();
				}
			}}
			onmouseenter={() => (highlight = i)}
		>
			<div class="row gap-sm">
				<div class="box grow min0">
					<text class="text-sm text-primary" class:text-muted={!enabled(level.id)}>{level.label}</text>
					<text class="text-xs text-muted truncate">
						{enabled(level.id) ? level.description : `Not supported by ${chat.modelId}`}
					</text>
				</div>
				{#if chat.thinkingLevel === level.id && enabled(level.id)}<Icon name="check" tone="accent" />{/if}
			</div>
		</div>
	{/each}
	<div class="row ycenter xbetween px-sm">
		<text class="text-xs text-muted">{LEVELS.length} levels · ↹ Navigate · ↵ Select · Esc Close</text>
	</div>
</div>
