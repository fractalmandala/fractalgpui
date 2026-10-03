<script lang="ts">
	import { open_palette } from '../kernel/commands.svelte.ts';
	import { settings, switch_to, toggle_theme } from '../kernel/settings.svelte.ts';
	import { active_tool, tools } from '../kernel/tools.svelte.ts';
	import Kbd from '../ui/Kbd.svelte';

	const current = $derived(active_tool().id);
</script>

<div class="wb-rail box hfull panel br">
	<div class="row ycenter gap-sm px-md h-lg bb">
		<div class="wb-glyph row xcenter ycenter radius-sm text-sm weight-700 text-theme"><text>fd</text></div>
		<text class="text-sm weight-600 text-primary">fractalgpui</text>
	</div>

	<div class="box gap-xs pad-sm grow min0 scroll-y">
		{#each tools as tool, i (tool.id)}
			<div
				class="wb-rail-item row ycenter gap-sm px-sm h-md radius-sm"
				class:active={tool.id === current}
				hitbox="self"
				testId={`rail-${tool.id}`}
				onclick={() => switch_to(tool.id)}
			>
				<div class="wb-glyph row xcenter ycenter radius-xs text-xs weight-600"><text>{tool.glyph}</text></div>
				<text class="grow min0 truncate text-sm">{tool.title}</text>
				{#if i < 9}<Kbd keys={`cmd-${i + 1}`} />{/if}
			</div>
		{/each}
	</div>

	<div class="box gap-xs pad-sm bt">
		<div class="wb-rail-item row ycenter gap-sm px-sm h-md radius-sm" hitbox="self" testId="rail-palette" onclick={open_palette}>
			<text class="grow text-sm">Commands</text>
			<Kbd keys="cmd-k" />
		</div>
		<div class="wb-rail-item row ycenter gap-sm px-sm h-md radius-sm" hitbox="self" testId="theme-toggle" onclick={toggle_theme}>
			<text class="grow text-sm">{settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}</text>
			<Kbd keys="cmd-shift-l" />
		</div>
	</div>
</div>
