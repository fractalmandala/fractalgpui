<script lang="ts">
	import Icon from '../../../ui/Icon.svelte';
	import IconButton from '../../../ui/IconButton.svelte';
	import SectionLabel from '../../../ui/SectionLabel.svelte';
	import { SAMPLES } from './samples.ts';
	import { clear_history, headline, load_sample, r2s_tool, replace_input } from './state.svelte.ts';

	// Left-sidebar context: the stock samples, and recent inputs (kept when an input is
	// replaced or its output copied). Clicking either loads it.
	const ago = (t: number) => {
		const s = Math.max(0, Math.round((Date.now() - t) / 1000));
		return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
	};
</script>

<div class="box gap-md pad-sm">
	<div class="box gap-xs">
		<div class="px-sm py-xs"><SectionLabel label="Samples" /></div>
		{#each SAMPLES as s (s.id)}
			<div class="wb-nav-item row ycenter gap-sm" class:active={r2s_tool.source === s.source} hitbox="self" testId={`r2s-sample-${s.id}`} onclick={() => load_sample(s.id)}>
				<Icon name="file-text" tone="secondary" />
				<text class="grow min0 truncate">{s.title}</text>
			</div>
		{/each}
	</div>

	{#if r2s_tool.history.length}
		<div class="box gap-xs">
			<div class="px-sm">
				<SectionLabel label="Recent">
					<IconButton icon="trash-2" testId="r2s-history-clear" onclick={() => clear_history()} />
				</SectionLabel>
			</div>
			{#each r2s_tool.history as h, i (h.at + ':' + i)}
				<div class="wb-nav-item row ycenter gap-sm" class:active={r2s_tool.source === h.source} hitbox="self" testId={`r2s-history-${i}`} onclick={() => replace_input(h.source)}>
					<Icon name="history" tone="secondary" />
					<text class="grow min0 truncate mono text-xs">{headline(h.source)}</text>
					<text class="text-xs text-muted">{ago(h.at)}</text>
				</div>
			{/each}
		</div>
	{/if}
</div>
