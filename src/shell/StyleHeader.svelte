<script lang="ts">
	import { copy_text } from '../kernel/clipboard.ts';
	import { settings } from '../kernel/settings.svelte.ts';
	import { flash } from '../kernel/status.svelte.ts';
	import { as_sass, is_default, reset_style } from '../kernel/style.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';

	// sidebar-right's header for the style editor: always in view, however far the
	// editor below is scrolled.
	function copy_sass() {
		if (copy_text(as_sass(settings.theme))) flash('Copied the style as Sass variables', 'success');
		else flash('Could not reach the clipboard (pbcopy)', 'danger');
	}
</script>

<div class="row ycenter xbetween grow min0 gap-sm">
	<text class="text-sm weight-600 text-primary truncate">Style</text>
	<div class="row ycenter gap-xs">
		<IconButton icon="copy" testId="style-copy" onclick={copy_sass} />
		<IconButton icon="refresh-cw" active={!is_default()} testId="style-reset" onclick={reset_style} />
	</div>
</div>
