<script lang="ts">
	import SectionLabel from '../../ui/SectionLabel.svelte';
	import Segmented from '../../ui/Segmented.svelte';
	import Toggle from '../../ui/Toggle.svelte';
	import { css_tool, type Comments, type Indent } from './state.svelte.ts';

	const COMMENTS: { value: Comments; label: string }[] = [
		{ value: 'silent', label: '// silent' },
		{ value: 'loud', label: '/* loud */' },
		{ value: 'drop', label: 'Drop' }
	];
	const INDENTS: { value: Indent; label: string }[] = [
		{ value: 'tab', label: 'Tab' },
		{ value: '2', label: '2 spaces' },
		{ value: '4', label: '4 spaces' }
	];
</script>

<div class="box gap-lg pad-md">
	<div class="box gap-sm">
		<SectionLabel label="Structure" />
		<Toggle label="Nest selectors" checked={css_tool.nest} testId="opt-nest" onchange={(v) => (css_tool.nest = v)} />
		<Toggle label="Fold @media into rules" checked={css_tool.nestMedia} testId="opt-media" onchange={(v) => (css_tool.nestMedia = v)} />
		<text class="text-xs text-muted">Nesting only happens where the compiled CSS keeps its order, so the cascade never changes.</text>
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Comments" />
		<Segmented options={COMMENTS} value={css_tool.comments} testId="opt-comments" onchange={(v) => (css_tool.comments = v)} />
	</div>
	<div class="box gap-sm">
		<SectionLabel label="Indent" />
		<Segmented options={INDENTS} value={css_tool.indent} testId="opt-indent" onchange={(v) => (css_tool.indent = v)} />
	</div>
</div>
