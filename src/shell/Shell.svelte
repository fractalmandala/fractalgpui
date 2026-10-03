<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import { close_palette, handle_key, move_selection, palette } from '../kernel/commands.svelte.ts';
	import { active_tool, install } from '../kernel/tools.svelte.ts';
	import CommandPalette from './CommandPalette.svelte';
	import StatusBar from './StatusBar.svelte';
	import ToolRail from './ToolRail.svelte';

	install();

	const tool = $derived(active_tool());

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

<div class="row full bg text-primary">
	<ToolRail />
	<div class="box grow min0 hfull">
		<div class="box grow min0" testId={`tool-${tool.id}`}>
			<tool.component />
		</div>
		<StatusBar />
	</div>
	{#if palette.open}<CommandPalette />{/if}
</div>
