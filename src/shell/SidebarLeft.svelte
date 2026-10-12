<script lang="ts">
	import { motion_duration, reset_width, set_width } from '../kernel/layout.svelte.ts';
	import { settings, switch_to, toggle_theme } from '../kernel/settings.svelte.ts';
	import { active_surface, surfaces } from '../kernel/surfaces.svelte.ts';
	import IconButton from '../ui/IconButton.svelte';
	import Splitter from '../ui/Splitter.svelte';


	// section-sidebar-left: header (surface nav in a row, theme toggle), body (the
	// active surface's `sections['sidebar-left'].body`). The collapse toggle lives
	// in the main header; collapsed, the section animates to 0 width (no rail).
	// `motion` owns the width: inline style never snaps it, and drags run with a
	// zero-length transition so the edge tracks the pointer 1:1.
	let { open, width }: { open: boolean; width: number } = $props();

	const current = $derived(active_surface());
	const Context = $derived(current.sections?.['sidebar-left']?.body);
	let resizing = $state(false);
</script>

<div
	class="section-sidebar-left box hfull panel min0"
	testId="section-sidebar-left"
	motion={{
		initial: false,
		animate: { width: open ? width : 0 },
		transition: resizing ? { duration: 0 } : { duration: motion_duration(), ease: 'easeOut' }
	}}
>
	<div class="section-sidebar-left-header row ycenter gap-sm px-md">
		<div class="row ycenter buttons-reel">
				{#each surfaces as s (s.id)}
			<div class="white-square"><IconButton icon={s.icon} active={s.id === current.id} testId={`nav-${s.id}`} onclick={() => switch_to(s.id)} /></div>
		{/each}
		<div class="white-square"><IconButton icon={settings.theme === 'dark' ? 'sun' : 'moon'} testId="theme-toggle" onclick={toggle_theme} /></div>
		</div>
	</div>

	<div class="section-sidebar-left-body box grow min0">
		<div class="box grow min0 bt scroll-y">
			{#if Context}<Context />{/if}
		</div>
	</div>

	{#if open}
		<Splitter
			edge="right"
			{width}
			testId="sidebar-left-splitter"
			onresize={(w) => set_width('sidebar-left', current, w)}
			onreset={() => reset_width('sidebar-left', current)}
			onstart={() => (resizing = true)}
			oncommit={() => (resizing = false)}
		/>
	{/if}
</div>
