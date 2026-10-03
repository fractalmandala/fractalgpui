<script lang="ts">
	import { win } from '../../kernel/window.svelte.ts';
	import { convert, css_tool } from './state.svelte.ts';

	// All state is in state.svelte.ts (persisted, survives tool switches); this page only renders it.
	const outcome = $derived(convert(css_tool));

	// GPUI's textarea sizes to its rows (20px each) and scrolls inside, so fill the
	// pane from the window height (polled by the shell; there is no resize event).
	const rows = $derived(Math.max(6, Math.min(60, Math.floor((win.height - 190) / 20))));

	const summary = $derived.by(() => {
		if (!outcome.ok) return '';
		const { stats, sass } = outcome.result;
		return `${stats.rules} rules · ${stats.nested} nested · ${sass.split('\n').length - 1} lines`;
	});
</script>

<div class="box full min0 pad-md gap-md">
	<div class="row grow min0 gap-md">
		<div class="box grow min0 gap-xs">
			<text class="wb-label">CSS</text>
			<textarea
				class="wb-editor border radius-sm pad-sm mono text-sm"
				testId="css-input"
				placeholder="Paste CSS here…"
				minRows={rows}
				maxRows={rows}
				value={css_tool.css}
				onchange={(e: { value: string }) => (css_tool.css = e.value)}
			></textarea>
		</div>

		<div class="box grow min0 gap-xs">
			<div class="row ycenter xbetween">
				<text class="wb-label">Sass</text>
				<text class="text-xs text-muted" testId="sass-stats">{summary}</text>
			</div>
			<div class="box grow min0 sunken border radius-sm pad-sm scroll-y">
				{#if outcome.ok}
					<!-- <code> paints its base text in `color` (default: a pale grey meant for dark backgrounds). -->
					<code class="mono text-sm text-primary shrink-0" testId="sass-output" code={outcome.result.sass} language="sass" showLineNumbers></code>
				{:else}
					<text class="text-sm text-danger" testId="sass-error">{outcome.error}</text>
				{/if}
			</div>
		</div>
	</div>

	{#if outcome.ok && outcome.result.warnings.length}
		<div class="box gap-xs shrink-0" testId="sass-warnings">
			{#each outcome.result.warnings as w, i (i)}
				<text class="text-xs text-warning">⚠ {w}</text>
			{/each}
		</div>
	{/if}
</div>
