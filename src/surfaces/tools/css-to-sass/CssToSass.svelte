<script lang="ts">
	import { design } from '../../../kernel/design.svelte.ts';
	import { win } from '../../../kernel/window.svelte.ts';
	import Diff from './Diff.svelte';
	import Options from './Options.svelte';
	import { compile_sass, convert, css_tool } from './state.svelte.ts';

	// All state is in state.svelte.ts (persisted, survives tool switches); this page only renders it.
	const forward = $derived(css_tool.direction === 'css-to-sass');
	const outcome = $derived(forward ? convert(css_tool) : null);
	const compiled = $derived(forward ? null : compile_sass(css_tool));

	// GPUI's textarea sizes to its rows and scrolls inside, so fill the pane from the
	// window height (polled by the shell; there is no resize event). Its row pitch is
	// fixed (26px, whatever the font-size or line-height); the output <code> takes the
	// same pitch through .wb-code so the two panes' lines sit level.
	const row = $derived(parseFloat(design.tokens.light['textarea-row'] ?? '26') || 26);
	const rows = $derived(Math.max(6, Math.min(60, Math.floor((win.height - 240) / row))));

	const summary = $derived.by(() => {
		if (outcome?.ok) {
			const { stats, sass } = outcome.result;
			return `${stats.rules} rules · ${stats.nested} nested · ${sass.split('\n').length - 1} lines`;
		}
		if (compiled?.ok) return `${compiled.syntax === 'scss' ? 'SCSS' : 'Indented'} · ${compiled.css.split('\n').length - 1} lines`;
		return '';
	});
</script>

<div class="box full min0 pad-md gap-md">
	<Options />
	{#if forward && css_tool.tab === 'diff'}
		<Diff />
	{:else}
	<div class="row grow min0 gap-md">
		<div class="box grow min0 gap-xs">
			<text class="wb-label">{forward ? 'CSS' : 'Sass'}</text>
			{#if forward}
				<textarea
					class="wb-editor border radius-sm pad-sm mono text-md"
					testId="css-input"
					placeholder="Paste CSS here…"
					minRows={rows}
					maxRows={rows}
					value={css_tool.css}
					onchange={(e: { value: string }) => (css_tool.css = e.value)}
				></textarea>
			{:else}
				<textarea
					class="wb-editor border radius-sm pad-sm mono text-md"
					testId="sass-input"
					placeholder="Paste Sass or SCSS here…"
					minRows={rows}
					maxRows={rows}
					value={css_tool.sass}
					onchange={(e: { value: string }) => (css_tool.sass = e.value)}
				></textarea>
			{/if}
		</div>

		<div class="box grow min0 gap-xs">
			<div class="row ycenter xbetween">
				<text class="wb-label">{forward ? 'Sass' : 'CSS'}</text>
				<text class="text-xs text-muted" testId="sass-stats">{summary}</text>
			</div>
			<div class="box grow min0 sunken border radius-sm pad-sm scroll-y">
				<!-- <code> paints its base text in `color` (default: a pale grey meant for dark backgrounds). -->
				{#if outcome}
					{#if outcome.ok}
						<code class="wb-code text-primary shrink-0" testId="sass-output" code={outcome.result.sass} language="css" showLineNumbers></code>
					{:else}
						<text class="text-sm text-danger" testId="sass-error">{outcome.error}</text>
					{/if}
				{:else if compiled}
					{#if compiled.ok}
						<code class="wb-code text-primary shrink-0" testId="css-output" code={compiled.css} language="css" showLineNumbers></code>
					{:else}
						<text class="text-sm text-danger" testId="css-error">{compiled.line ? `Line ${compiled.line}: ` : ''}{compiled.error}</text>
					{/if}
				{/if}
			</div>
		</div>
	</div>
	{/if}

	{#if outcome?.ok && outcome.result.warnings.length}
		<div class="box gap-xs shrink-0" testId="sass-warnings">
			{#each outcome.result.warnings as w, i (i)}
				<text class="text-xs text-warning">⚠ {w}</text>
			{/each}
		</div>
	{/if}
</div>
