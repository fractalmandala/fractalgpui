<script lang="ts">
	import Icon from '../../../ui/Icon.svelte';
	import IconButton from '../../../ui/IconButton.svelte';
	import SectionLabel from '../../../ui/SectionLabel.svelte';
	import { clear_history, css_tool, headline, load_sample, replace_input, SAMPLES } from './state.svelte.ts';

	// Left-sidebar context: the stock samples, and recent inputs (kept when an input is
	// replaced or its Sass is copied). Clicking either loads it.
	const ago = (t: number) => {
		const s = Math.max(0, Math.round((Date.now() - t) / 1000));
		return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
	};
</script>

<div class="box gap-md pad-sm">
	<div class="box gap-xs">
		<div class="px-sm py-xs"><SectionLabel label="Samples" /></div>
		{#each SAMPLES as s (s.id)}
			<div class="wb-nav-item row ycenter gap-sm" class:active={css_tool.css === s.css} hitbox="self" testId={`sample-${s.id}`} onclick={() => load_sample(s.id)}>
				<Icon name="file-text" tone="secondary" />
				<text class="grow min0 truncate">{s.title}</text>
			</div>
		{/each}
	</div>

	{#if css_tool.history.length}
		<div class="box gap-xs">
			<div class="px-sm">
				<SectionLabel label="Recent">
					<IconButton icon="trash-2" testId="history-clear" onclick={clear_history} />
				</SectionLabel>
			</div>
			{#each css_tool.history as h, i (h.at + ':' + i)}
				<div class="wb-nav-item row ycenter gap-sm" class:active={css_tool.css === h.css} hitbox="self" testId={`history-${i}`} onclick={() => replace_input(h.css)}>
					<Icon name="history" tone="secondary" />
					<text class="grow min0 truncate mono text-xs">{headline(h.css)}</text>
					<text class="text-xs text-muted">{ago(h.at)}</text>
				</div>
			{/each}
		</div>
	{/if}
</div>
