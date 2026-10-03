<script lang="ts">
	import { open_palette } from '../kernel/commands.svelte.ts';
	import { reset_width, set_width, toggle } from '../kernel/layout.svelte.ts';
	import { settings, switch_to, toggle_theme } from '../kernel/settings.svelte.ts';
	import { active_surface, surfaces } from '../kernel/surfaces.svelte.ts';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import Pill from '../ui/Pill.svelte';
	import Splitter from '../ui/Splitter.svelte';

	// section-sidebar-left: header (brand, collapse), body (surface nav, then the active
	// surface's `sections['sidebar-left'].body`), footer (app actions). Collapsed, it is
	// a 52px rail of icons (`mode="rail"`).
	let { mode, width }: { mode: 'open' | 'rail'; width: number } = $props();

	const current = $derived(active_surface());
	const Context = $derived(current.sections?.['sidebar-left']?.body);
</script>

{#if mode === 'rail'}
	<div class="section-sidebar-left rail box ycenter gap-xs py-sm hfull panel br" testId="section-sidebar-left-rail">
		<div class="wb-brand row xcenter ycenter mb-sm"><text>f</text></div>
		{#each surfaces as tool (tool.id)}
			<IconButton icon={tool.icon} active={tool.id === current.id} testId={`rail-${tool.id}`} onclick={() => switch_to(tool.id)} />
		{/each}
		<div class="grow"></div>
		<IconButton icon="search" testId="rail-palette" onclick={open_palette} />
		<IconButton icon={settings.theme === 'dark' ? 'sun' : 'moon'} testId="theme-toggle" onclick={toggle_theme} />
		<IconButton icon="panel-left" testId="sidebar-left-expand" onclick={() => toggle('sidebar-left', current)} />
	</div>
{:else}
	<div class="section-sidebar-left box hfull panel br" style={`width: ${width}px`} testId="section-sidebar-left">
		<div class="section-sidebar-left-header row ycenter xbetween gap-sm px-md">
			<div class="row ycenter gap-sm min0">
				<div class="wb-brand row xcenter ycenter"><text>f</text></div>
				<text class="text-sm weight-600 text-primary truncate">Fractal workbench</text>
			</div>
			<IconButton icon="panel-left-close" testId="sidebar-left-collapse" onclick={() => toggle('sidebar-left', current)} />
		</div>

		<div class="section-sidebar-left-body box grow min0">
		<div class="box gap-xs px-sm pb-sm">
			{#each surfaces as tool, i (tool.id)}
				<div
					class="wb-nav-item row ycenter gap-sm"
					class:active={tool.id === current.id}
					hitbox="self"
					testId={`nav-${tool.id}`}
					onclick={() => switch_to(tool.id)}
				>
					<Icon name={tool.icon} tone={tool.id === current.id ? 'primary' : 'secondary'} />
					<text class="grow min0 truncate">{tool.title}</text>
					{#if tool.badge?.() != null}<Pill label={tool.badge?.() ?? ''} />{/if}
					{#if i < 9}<Kbd keys={`cmd-${i + 1}`} />{/if}
				</div>
			{/each}
		</div>

		<div class="box grow min0 bt scroll-y">
			{#if Context}<Context />{/if}
		</div>
		</div>

		<div class="section-sidebar-left-footer box gap-xs pad-sm bt">
			<div class="wb-nav-item row ycenter gap-sm" hitbox="self" testId="nav-palette" onclick={open_palette}>
				<Icon name="search" tone="secondary" />
				<text class="grow">Commands</text>
				<Kbd keys="cmd-k" />
			</div>
			<div class="wb-nav-item row ycenter gap-sm" hitbox="self" testId="theme-toggle" onclick={toggle_theme}>
				<Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} tone="secondary" />
				<text class="grow">{settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}</text>
				<Kbd keys="cmd-shift-l" />
			</div>
		</div>

		<Splitter
			edge="right"
			{width}
			testId="sidebar-left-splitter"
			onresize={(w) => set_width('sidebar-left', current, w)}
			onreset={() => reset_width('sidebar-left', current)}
		/>
	</div>
{/if}
