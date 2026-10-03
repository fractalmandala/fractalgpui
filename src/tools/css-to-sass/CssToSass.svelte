<script lang="ts">
	import { get_native } from 'gpuix-svelte/renderer';
	import Button from '../../ui/Button.svelte';
	import { clear, convert, copy_output, css_tool, cycle_comments, cycle_indent, load_sample } from './state.svelte.ts';

	// All state is in state.svelte.ts (persisted, survives tool switches); this page only renders it.
	const outcome = $derived(convert(css_tool));

	// GPUI's textarea sizes to its rows (20px each) and scrolls inside; fill the pane
	// for the window height at mount (no resize relayout in Milestone 1).
	const rows = (() => {
		const height = get_native()?.getWindowSize().height ?? 640;
		return Math.max(6, Math.min(60, Math.floor((height - 210) / 20)));
	})();

	const summary = $derived.by(() => {
		if (!outcome.ok) return '';
		const { stats, sass } = outcome.result;
		return `${stats.rules} rules · ${stats.nested} nested · ${sass.split('\n').length - 1} lines`;
	});
</script>

<div class="box full min0 pad-md gap-md">
	<div class="row ycenter xbetween gap-md shrink-0">
		<div class="box gap-xs min0">
			<text class="text-lg weight-600">CSS → Sass</text>
			<text class="text-sm text-muted">Paste CSS; get indented Sass, nested where the cascade stays the same.</text>
		</div>
		<div class="row ycenter gap-xs">
			<Button label="Sample" variant="ghost" testId="sample" onclick={load_sample} />
			<Button label="Clear" variant="ghost" testId="clear" onclick={clear} />
			<Button label="Copy Sass" variant="primary" testId="copy" onclick={copy_output} />
		</div>
	</div>

	<div class="row ycenter gap-xs shrink-0">
		<Button label="Nest selectors" active={css_tool.nest} testId="opt-nest" onclick={() => (css_tool.nest = !css_tool.nest)} />
		<Button label="Fold @media" active={css_tool.nestMedia} testId="opt-media" onclick={() => (css_tool.nestMedia = !css_tool.nestMedia)} />
		<Button label={`Comments: ${css_tool.comments}`} testId="opt-comments" onclick={cycle_comments} />
		<Button label={`Indent: ${css_tool.indent === 'tab' ? 'tab' : `${css_tool.indent} spaces`}`} testId="opt-indent" onclick={cycle_indent} />
	</div>

	<div class="row grow min0 gap-md">
		<div class="box grow min0 gap-xs">
			<text class="text-xs text-muted weight-600">CSS</text>
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
				<text class="text-xs text-muted weight-600">SASS</text>
				<text class="text-xs text-muted" testId="sass-stats">{summary}</text>
			</div>
			<div class="box grow min0 sunken border radius-sm pad-sm scroll-y">
				{#if outcome.ok}
					<code class="mono text-sm shrink-0" testId="sass-output" code={outcome.result.sass} language="sass" showLineNumbers></code>
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
