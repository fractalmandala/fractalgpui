<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import { close_palette, handle_key, move_selection, palette } from '../kernel/commands.svelte.ts';
	import { fit, width_of } from '../kernel/layout.svelte.ts';
	import { active_surface, ensure_loaded, install } from '../kernel/surfaces.svelte.ts';
	import { watch_window, win } from '../kernel/window.svelte.ts';
	import Tabs from '../ui/Tabs.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import MainFooter from './MainFooter.svelte';
	import MainHeader from './MainHeader.svelte';
	import Sidebar from './Sidebar.svelte';
	import SidebarLeft from './SidebarLeft.svelte';

	install();

	// Sections (assets/wireframe-v1.png):
	// section-sidebar-left | section-main (header, body, footer) | section-sidebar-panel | section-sidebar-right
	const tool = $derived(active_surface());
	const widths = $derived({
		'sidebar-left': width_of('sidebar-left', tool),
		'sidebar-panel': width_of('sidebar-panel', tool),
		'sidebar-right': width_of('sidebar-right', tool)
	});
	const shown = $derived(fit(win.width, tool, widths));

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
	<SidebarLeft mode={shown['sidebar-left']} width={widths['sidebar-left']} />

	<div class="section-main box grow min0 hfull" testId="section-main">
		<MainHeader panel={shown['sidebar-panel']} right={shown['sidebar-right']} />
		<div class="section-main-body box grow min0" testId="section-main-body">
			{#if tool.tabs}
				<Tabs tabs={tool.tabs.list()} value={tool.tabs.value()} onchange={tool.tabs.select} testId="surface-tabs" />
			{/if}
			<div class="box grow min0" testId={`tool-${tool.id}`}>
				<tool.component />
			</div>
		</div>
		<MainFooter />
	</div>

	{#if shown['sidebar-panel']}<Sidebar region="sidebar-panel" width={widths['sidebar-panel']} />{/if}
	{#if shown['sidebar-right']}<Sidebar region="sidebar-right" width={widths['sidebar-right']} />{/if}

	{#if palette.open}<CommandPalette />{/if}
</div>
