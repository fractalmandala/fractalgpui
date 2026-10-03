<script lang="ts">
	import Segmented from '../../../ui/Segmented.svelte';
	import Toggle from '../../../ui/Toggle.svelte';
	import { css_tool, set_direction, type Comments, type Direction, type Indent, type OutputStyle, type Syntax } from './state.svelte.ts';

	// The direction, then that direction's options, as one compact row above the panes.
	const DIRECTIONS: { value: Direction; label: string }[] = [
		{ value: 'css-to-sass', label: 'CSS → Sass' },
		{ value: 'sass-to-css', label: 'Sass → CSS' }
	];
	const SYNTAXES: { value: Syntax; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'indented', label: 'Indented' },
		{ value: 'scss', label: 'SCSS' }
	];
	const STYLES: { value: OutputStyle; label: string }[] = [
		{ value: 'expanded', label: 'Expanded' },
		{ value: 'compressed', label: 'Compressed' }
	];
	const COMMENTS: { value: Comments; label: string }[] = [
		{ value: 'silent', label: '// silent' },
		{ value: 'loud', label: '/* loud */' },
		{ value: 'drop', label: 'Drop' }
	];
	const INDENTS: { value: Indent; label: string }[] = [
		{ value: 'tab', label: 'Tab' },
		{ value: '2', label: '2' },
		{ value: '4', label: '4' }
	];
</script>

<div class="row wrap ycenter gap-lg shrink-0" testId="options">
	<Segmented options={DIRECTIONS} value={css_tool.direction} testId="opt-direction" onchange={set_direction} />
	{#if css_tool.direction === 'sass-to-css'}
	<div class="row ycenter gap-sm">
		<text class="text-sm text-secondary">Syntax</text>
		<Segmented options={SYNTAXES} value={css_tool.syntax} testId="opt-syntax" onchange={(v) => (css_tool.syntax = v)} />
	</div>
	<div class="row ycenter gap-sm">
		<text class="text-sm text-secondary">Output</text>
		<Segmented options={STYLES} value={css_tool.style} testId="opt-style" onchange={(v) => (css_tool.style = v)} />
	</div>
	{:else}
	<div class="row ycenter gap-sm"><Toggle checked={css_tool.nest} testId="opt-nest" onchange={(v) => (css_tool.nest = v)} /><text class="text-sm text-secondary">Nest selectors</text></div>
	<div class="row ycenter gap-sm"><Toggle checked={css_tool.nestMedia} testId="opt-media" onchange={(v) => (css_tool.nestMedia = v)} /><text class="text-sm text-secondary">Fold @media</text></div>
	<div class="row ycenter gap-sm">
		<text class="text-sm text-secondary">Comments</text>
		<Segmented options={COMMENTS} value={css_tool.comments} testId="opt-comments" onchange={(v) => (css_tool.comments = v)} />
	</div>
	<div class="row ycenter gap-sm">
		<text class="text-sm text-secondary">Indent</text>
		<Segmented options={INDENTS} value={css_tool.indent} testId="opt-indent" onchange={(v) => (css_tool.indent = v)} />
	</div>
	{/if}
</div>
