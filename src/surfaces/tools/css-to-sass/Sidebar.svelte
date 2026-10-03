<script lang="ts">
	import Icon from '../../../ui/Icon.svelte';
	import IconButton from '../../../ui/IconButton.svelte';
	import SectionLabel from '../../../ui/SectionLabel.svelte';
	import { headline, clear_history, history_of, input_of, load_sample, replace_input, samples_of } from './state.svelte.ts';

	// Left-sidebar context, for the current direction: its stock samples, and its recent
	// inputs (kept when an input is replaced, swapped or its output copied). Clicking
	// either loads it.
	const samples = $derived(samples_of());
	const history = $derived(history_of());
	const current = $derived(input_of());
	const ago = (t: number) => {
		const s = Math.max(0, Math.round((Date.now() - t) / 1000));
		return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
	};
</script>

<div class="box gap-md pad-sm">
	<div class="box gap-xs">
		<div class="px-sm py-xs"><SectionLabel label="Samples" /></div>
		{#each samples as s (s.id)}
			<div class="wb-nav-item row ycenter gap-sm" class:active={current === s.css} hitbox="self" testId={`sample-${s.id}`} onclick={() => load_sample(s.id)}>
				<Icon name="file-text" tone="secondary" />
				<text class="grow min0 truncate">{s.title}</text>
			</div>
		{/each}
	</div>

	{#if history.length}
		<div class="box gap-xs">
			<div class="px-sm">
				<SectionLabel label="Recent">
					<IconButton icon="trash-2" testId="history-clear" onclick={() => clear_history()} />
				</SectionLabel>
			</div>
			{#each history as h, i (h.at + ':' + i)}
				<div class="wb-nav-item row ycenter gap-sm" class:active={current === h.css} hitbox="self" testId={`history-${i}`} onclick={() => replace_input(h.css)}>
					<Icon name="history" tone="secondary" />
					<text class="grow min0 truncate mono text-xs">{headline(h.css)}</text>
					<text class="text-xs text-muted">{ago(h.at)}</text>
				</div>
			{/each}
		</div>
	{/if}
</div>
