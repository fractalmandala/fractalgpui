<script lang="ts">
	import Icon from '../../../ui/Icon.svelte';
	import IconButton from '../../../ui/IconButton.svelte';
	import SectionLabel from '../../../ui/SectionLabel.svelte';
	import { clear_history, headline, r2s_tool, replace_input } from './state.svelte.ts';


	// Left-sidebar context: recent inputs (kept when an input is replaced or its
	// output copied). Clicking one loads it. Clearing asks first: the trash arms
	// a confirm row.
	let confirm_clear = $state(false);
	const ago = (t: number) => {
		const s = Math.max(0, Math.round((Date.now() - t) / 1000));
		return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
	};
</script>

<div class="box gap-md pad-md">
	{#if r2s_tool.history.length}
		<div class="box gap-xs">
			<div class="px-sm">
				<SectionLabel label={confirm_clear ? 'Clear all recent?' : 'Recent'}>
					{#if confirm_clear}
						<div class="row ycenter gap-xs">
							<IconButton icon="check" testId="r2s-history-clear-confirm" onclick={() => (clear_history(), (confirm_clear = false))} />
							<IconButton icon="x" testId="r2s-history-clear-cancel" onclick={() => (confirm_clear = false)} />
						</div>
					{:else}
						<IconButton icon="trash-2" testId="r2s-history-clear" onclick={() => (confirm_clear = true)} />
					{/if}
				</SectionLabel>
			</div>
			{#each r2s_tool.history as h, i (h.at + ':' + i)}
				<div class="nav-section row ycenter gap-sm" class:active={r2s_tool.source === h.source} hitbox="self" testId={`r2s-history-${i}`} onclick={() => replace_input(h.source)}>
					<Icon name="history" tone="secondary" />
					<text class="nav-section-title grow min0 truncate">{headline(h.source)}</text>
					<text class="nav-section-small">{ago(h.at)}</text>
				</div>
			{/each}
		</div>
	{/if}
</div>
