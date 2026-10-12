<script lang="ts">
	import Icon from '../../../ui/Icon.svelte';
	import IconButton from '../../../ui/IconButton.svelte';
	import SectionLabel from '../../../ui/SectionLabel.svelte';
	import { headline, clear_history, history_of, input_of, replace_input } from './state.svelte.ts';


	// Left-sidebar context, for the current direction: its recent inputs (kept when
	// an input is replaced, swapped or its output copied). Clicking one loads it.
	// Clearing asks first: the trash arms a confirm row.
	const history = $derived(history_of());
	const current = $derived(input_of());
	let confirm_clear = $state(false);
	const ago = (t: number) => {
		const s = Math.max(0, Math.round((Date.now() - t) / 1000));
		return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
	};
</script>

<div class="box gap-md pad-md">
	{#if history.length}
		<div class="box gap-xs">
			<div class="px-sm">
				<SectionLabel label={confirm_clear ? 'Clear all recent?' : 'Recent'}>
					{#if confirm_clear}
						<div class="row ycenter gap-xs">
							<IconButton icon="check" testId="history-clear-confirm" onclick={() => (clear_history(), (confirm_clear = false))} />
							<IconButton icon="x" testId="history-clear-cancel" onclick={() => (confirm_clear = false)} />
						</div>
					{:else}
						<IconButton icon="trash-2" testId="history-clear" onclick={() => (confirm_clear = true)} />
					{/if}
				</SectionLabel>
			</div>
			{#each history as h, i (h.at + ':' + i)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="wb-row-item row ycenter gap-sm" class:active={current === h.css} hitbox="self" testId={`history-${i}`} onclick={() => replace_input(h.css)}>
					<Icon name="history" tone="secondary" />
					<text class="nav-section-title truncate">{headline(h.css)}</text>
					<text class="nav-section-small">{ago(h.at)}</text>
				</div>
			{/each}
		</div>
	{/if}
</div>
