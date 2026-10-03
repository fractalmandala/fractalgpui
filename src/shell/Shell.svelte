<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import { close_palette, handle_key, move_selection, palette } from '../kernel/commands.svelte.ts';
	import { fit, width_of } from '../kernel/layout.svelte.ts';
	import { active_surface, ensure_loaded, install } from '../kernel/surfaces.svelte.ts';
	import { watch_window, win } from '../kernel/window.svelte.ts';
	import Tabs from '../ui/Tabs.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import LeftSidebar from './LeftSidebar.svelte';
	import RightPanel from './RightPanel.svelte';
	import StatusBar from './StatusBar.svelte';
	import TitleBar from './TitleBar.svelte';

	install();

	// Regions: left sidebar (or rail) | title bar, tabs, surface, status bar | right A | right B.
	// The right containers are always available; the surface may fill them.
	const tool = $derived(active_surface());
	const widths = $derived({
		left: width_of('left', tool.id, tool.layout),
		rightA: width_of('rightA', tool.id, tool.layout),
		rightB: width_of('rightB', tool.id, tool.layout)
	});
	const shown = $derived(fit(win.width, { left: true, rightA: true, rightB: true }, widths));

	$effect(() => watch_window());
	$effect(() => ensure_loaded(tool));

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

<div class="row full sans bg text-primary">
	{#if shown.left !== 'none'}<LeftSidebar mode={shown.left} width={widths.left} />{/if}

	<div class="box grow min0 hfull" testId="main">
		<TitleBar rightA={shown.rightA} rightB={shown.rightB} />
		{#if tool.tabs}
			<Tabs tabs={tool.tabs.list()} value={tool.tabs.value()} onchange={tool.tabs.select} testId="surface-tabs" />
		{/if}
		<div class="box grow min0" testId={`tool-${tool.id}`}>
			<tool.component />
		</div>
		<StatusBar />
	</div>

	{#if shown.rightA}<RightPanel region="rightA" slot={tool.panels?.rightA} width={widths.rightA} />{/if}
	{#if shown.rightB}<RightPanel region="rightB" slot={tool.panels?.rightB} width={widths.rightB} />{/if}

	{#if palette.open}<CommandPalette />{/if}
</div>
