<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import { close_palette, handle_key, move_selection, palette } from '../kernel/commands.svelte.ts';
	import { cancel_drag, ui } from '../kernel/dock/dock.svelte.ts';
	import { install } from '../kernel/views.svelte.ts';
	import CommandPalette from './CommandPalette.svelte';
	import Dock from './Dock.svelte';
	import MainFooter from './MainFooter.svelte';

	install();

	// The shell: a dark backdrop with the dock on it and the status bar under it. Panes are
	// islands: the backdrop shows in the 2px gaps (see `.wb-shell`).
	// A tab released anywhere that is not a drop zone cancels the drag (deferred, so a drop
	// handler that runs in the same event still sees the drag).
	function released() {
		if (ui.drag) setTimeout(cancel_drag, 0);
	}

	// One window-level key handler: the palette's navigation while it is open,
	// otherwise the keymap. Enter is the palette input's own `onsubmit`.
	$effect(() =>
		on_window_key('keydown', (e) => {
			if (palette.open) {
				if (e.key === 'up') return void move_selection(-1);
				if (e.key === 'down') return void move_selection(1);
				if (e.key === 'escape') return void close_palette();
				if (e.key === 'enter') return;
			}
			handle_key(e);
		})
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-shell box full sans text-primary" testId="shell" onmouseup={released}>
	<Dock />
	<MainFooter />
	{#if palette.open}<CommandPalette />{/if}
</div>
