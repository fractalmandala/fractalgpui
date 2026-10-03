<script lang="ts">
	import { design } from '../../kernel/design.svelte.ts';
	import { switch_to } from '../../kernel/settings.svelte.ts';
	import { TOOLS } from '../index.ts';
	import Icon from '../../ui/Icon.svelte';
	import Kbd from '../../ui/Kbd.svelte';

	const tools = TOOLS.filter((t) => t.id !== 'home');

	// Planned next (docs/architecture plan); shown so the rail's future is visible.
	const PLANNED = [
		{ title: 'Sass → CSS', description: 'Compile indented Sass or SCSS with dart-sass.' },
		{ title: 'Class finder', description: 'Search fractalstyler classes and see what GPUI keeps of each.' },
		{ title: 'Token inspector', description: 'Every fractalstyler token, light and dark, flattened to px.' },
		{ title: 'Colour tools', description: 'Contrast, conversions and palettes from the theme.' }
	];

	const SHORTCUTS = [
		{ keys: 'cmd-k', title: 'Command palette' },
		{ keys: 'cmd-1', title: 'Tools 1–9' },
		{ keys: 'cmd-shift-l', title: 'Toggle light / dark' },
		{ keys: 'cmd-shift-c', title: 'Copy Sass (CSS → Sass)' }
	];
</script>

<div class="box full min0 pad-lg gap-lg scroll-y">
	<div class="box gap-xs">
		<text class="text-2xl weight-700">Fractal workbench</text>
		<text class="text-sm text-muted">Small design-dev tools on GPUI, styled by fractalstyler.</text>
	</div>

	<div class="box gap-sm">
		<text class="text-xs text-muted weight-600">TOOLS</text>
		<div class="row wrap gap-sm">
			{#each tools as tool (tool.id)}
				<div class="wb-card clickable box gap-xs" hitbox="self" testId={`home-open-${tool.id}`} onclick={() => switch_to(tool.id)}>
					<div class="row ycenter gap-sm">
						<div class="wb-glyph row xcenter ycenter radius-md"><Icon name={tool.icon} tone="primary" /></div>
						<text class="text-md weight-600">{tool.title}</text>
					</div>
					<text class="text-sm text-secondary">{tool.description}</text>
				</div>
			{/each}
		</div>
	</div>

	<div class="box gap-sm">
		<text class="text-xs text-muted weight-600">PLANNED</text>
		<div class="box gap-xs">
			{#each PLANNED as p (p.title)}
				<div class="row ycenter gap-sm">
					<text class="text-sm weight-500">{p.title}</text>
					<text class="text-sm text-muted">{p.description}</text>
				</div>
			{/each}
		</div>
	</div>

	<div class="box gap-sm">
		<text class="text-xs text-muted weight-600">SHORTCUTS</text>
		<div class="box gap-xs">
			{#each SHORTCUTS as s (s.keys)}
				<div class="row ycenter gap-sm"><Kbd keys={s.keys} /><text class="text-sm text-secondary">{s.title}</text></div>
			{/each}
		</div>
	</div>

	{#if design.report}
		<div class="box gap-xs" testId="style-report">
			<text class="text-xs text-muted weight-600">STYLES</text>
			<text class="text-sm text-secondary"
				>{design.report.registered} GPUI rules from fractalstyler src ({design.report.mode}); {design.report.losses} declarations GPUI cannot express were dropped.</text
			>
			{#each design.report.warnings as w, i (i)}
				<text class="text-xs text-warning">⚠ {w}</text>
			{/each}
		</div>
	{/if}
</div>
