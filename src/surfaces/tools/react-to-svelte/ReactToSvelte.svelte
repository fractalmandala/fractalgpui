<script lang="ts">
	import { design } from '../../../kernel/design.svelte.ts';
	import { win } from '../../../kernel/window.svelte.ts';
	import { convert, current_file, r2s_tool } from './state.svelte.ts';

	// All state is in state.svelte.ts (persisted, survives tool switches); this page only renders it.
	const outcome = $derived(convert(r2s_tool.source));
	const file = $derived(outcome.ok ? current_file() : null);
	const warnings = $derived(outcome.ok ? outcome.result.warnings : []);

	// GPUI's textarea sizes to its rows and scrolls inside, so fill the pane from the
	// window height (polled by the shell). Its row pitch is fixed (26px); the output
	// <code> takes the same pitch through .wb-code so the two panes' lines sit level.
	const row = $derived(parseFloat(design.tokens.light['textarea-row'] ?? '26') || 26);
	const rows = $derived(Math.max(6, Math.min(60, Math.floor((win.height - 240 - warnings.length * 20) / row))));

	const summary = $derived.by(() => {
		if (!outcome.ok || !file) return '';
		const n = outcome.result.files.length;
		return `${n} file${n === 1 ? '' : 's'} · ${file.code.split('\n').length - 1} lines`;
	});
</script>

<div class="box full min0 pad-md gap-md">
	<div class="row grow min0 gap-md">
		<div class="box grow min0 gap-xs">
			<text class="wb-label">React (TSX)</text>
			<textarea
				class="wb-editor border radius-sm pad-sm mono text-md"
				testId="react-input"
				placeholder="Paste a React component here…"
				minRows={rows}
				maxRows={rows}
				value={r2s_tool.source}
				onchange={(e: { value: string }) => (r2s_tool.source = e.value)}
			></textarea>
		</div>

		<div class="box grow min0 gap-xs">
			<div class="row ycenter xbetween">
				<text class="wb-label">{file ? file.name : 'Svelte'}</text>
				<text class="text-xs text-muted" testId="svelte-stats">{summary}</text>
			</div>
			<div class="box grow min0 sunken border radius-sm pad-sm scroll-y">
				<!-- <code> paints its base text in `color` (default: a pale grey meant for dark backgrounds). -->
				{#if outcome.ok && file}
					<code class="wb-code text-primary shrink-0" testId="svelte-output" code={file.code} language="svelte" showLineNumbers></code>
				{:else if !outcome.ok}
					<text class="text-sm text-danger" testId="react-error">{outcome.line ? `Line ${outcome.line}: ` : ''}{outcome.error}</text>
				{/if}
			</div>
		</div>
	</div>

	{#if warnings.length}
		<div class="box gap-xs shrink-0" testId="svelte-warnings">
			{#each warnings as w, i (i)}
				<text class="text-xs text-warning" testId={`svelte-warning-${i}`}>⚠ {w}</text>
			{/each}
		</div>
	{/if}
</div>
