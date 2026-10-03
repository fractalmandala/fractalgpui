<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import { close_palette, handle_key, move_selection, palette } from '../kernel/commands.svelte.ts';
	import { fit, width_of } from '../kernel/layout.svelte.ts';
	import { active_tool, install } from '../kernel/tools.svelte.ts';
	import { watch_window, win } from '../kernel/window.svelte.ts';
	import Tabs from '../ui/Tabs.svelte';
	import AgentPanel from './AgentPanel.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import LeftSidebar from './LeftSidebar.svelte';
	import RightPanel from './RightPanel.svelte';
	import StatusBar from './StatusBar.svelte';
	import TitleBar from './TitleBar.svelte';

	install();

	// Regions: left sidebar (or rail) | title bar, tabs, surface, status bar | agent | inspector.
	const tool = $derived(active_tool());
	const widths = $derived({
		left: width_of('left', tool.id, tool.layout),
		agent: width_of('agent', tool.id, tool.layout),
		inspector: width_of('inspector', tool.id, tool.layout)
	});
	const shown = $derived(fit(win.width, { left: true, agent: tool.agent !== false, inspector: !!tool.inspector }, widths));
	const Agent = $derived(tool.agent || AgentPanel);
	const Inspector = $derived(tool.inspector);

	$effect(() => watch_window());

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
		<TitleBar agent={shown.agent} inspector={shown.inspector} />
		{#if tool.tabs}
			<Tabs tabs={tool.tabs.list()} value={tool.tabs.value()} onchange={tool.tabs.select} testId="surface-tabs" />
		{/if}
		<div class="box grow min0" testId={`tool-${tool.id}`}>
			<tool.component />
		</div>
		<StatusBar />
	</div>

	{#if shown.agent}
		<RightPanel region="agent" title="Agent" width={widths.agent}><Agent /></RightPanel>
	{/if}
	{#if shown.inspector && Inspector}
		<RightPanel region="inspector" title={tool.inspectorTitle ?? 'Inspector'} width={widths.inspector}>
			<div class="box full min0 scroll-y"><Inspector /></div>
		</RightPanel>
	{/if}

	{#if palette.open}<CommandPalette />{/if}
</div>
