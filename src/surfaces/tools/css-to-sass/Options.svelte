<script lang="ts">
	import Segmented from '../../../ui/Segmented.svelte';
	import Toggle from '../../../ui/Toggle.svelte';
	import { css_tool, type Comments, type Indent } from './state.svelte.ts';

	// The converter's options, as one compact row above the panes.
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
</div>
