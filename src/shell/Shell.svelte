<script lang="ts">
	import { on_window_key, window_drag } from 'gpuix-svelte';
	import { close_palette, handle_key, move_selection, palette } from '../kernel/commands.svelte.ts';
	import { cancel_drag, ui } from '../kernel/dock/dock.svelte.ts';
	import { install } from '../kernel/views.svelte.ts';
	import CommandPalette from './CommandPalette.svelte';
	import Dock from './Dock.svelte';
	import { status } from '../kernel/status.svelte.ts';

	install();

	// The shell: an 80px left strip (macOS traffic lights at its top), a transparent 32px
	// title strip across the top (the window's own title bar is taken over, see
	// kernel/chrome.ts), and the dock on a dark backdrop. Panes are islands: the backdrop
	// shows in the 2px gaps (see `.wb-shell`). No footer / status bar. Both strips are the
	// window's drag region (the native bar no longer drags): `window_drag` moves the window
	// on a press and runs the macOS double-click action, skipping interactive children.
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
	<div class="row grow min0" testId="shell-body">
		<div class="wb-sidebar-strip" testId="sidebar-strip" onmousedown={window_drag}></div>
		<div class="box grow min0">
			<div class="wb-title-strip row ycenter xbetween" testId="title-strip" onmousedown={window_drag}>
				<div></div>
				{#if status.message}
					<text
						testId="status-message"
						class:text-success={status.tone === 'success'}
						class:text-danger={status.tone === 'danger'}
						class:text-secondary={status.tone === 'info'}>{status.message}</text
					>
				{/if}
			</div>
			<Dock />
		</div>
	</div>
	{#if palette.open}<CommandPalette />{/if}
</div>
