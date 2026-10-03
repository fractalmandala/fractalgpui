<script lang="ts">
	import { switch_to } from '../../kernel/settings.svelte.ts';
	import Icon from '../../ui/Icon.svelte';
	import Kbd from '../../ui/Kbd.svelte';
	import Pill from '../../ui/Pill.svelte';
	import SectionLabel from '../../ui/SectionLabel.svelte';
	import { PLANNED, SURFACES } from '../index.ts';

	// Every surface but Home, in rail order (so the shortcut is index + 1).
	const surfaces = SURFACES.map((s, i) => ({ s, keys: i < 9 ? `cmd-${i + 1}` : null })).filter(({ s }) => s.id !== 'home');

	const SHORTCUTS = [
		{ keys: 'cmd-k', title: 'Commands' },
		{ keys: 'cmd-b', title: 'Left sidebar' },
		{ keys: 'cmd-j', title: 'Agent' },
		{ keys: 'cmd-i', title: 'Inspector' },
		{ keys: 'cmd-shift-l', title: 'Light / dark' }
	];
</script>

<div class="box full min0 scroll-y">
	<div class="box gap-xl pad-xl">
		<div class="box gap-xs">
			<text class="text-2xl weight-600">Fractal workbench</text>
			<text class="text-sm text-muted">Design-dev tools on GPUI, styled by fractalstyler.</text>
		</div>

		<div class="box gap-sm">
			<SectionLabel label="Surfaces"><Pill label={surfaces.length} /></SectionLabel>
			<div class="row wrap gap-md">
				{#each surfaces as { s, keys } (s.id)}
					<div class="wb-tile wb-card clickable box gap-md" hitbox="self" testId={`home-open-${s.id}`} onclick={() => switch_to(s.id)}>
						<div class="row ycenter xbetween">
							<div class="wb-glyph row xcenter ycenter radius-md"><Icon name={s.icon} tone="primary" /></div>
							{#if keys}<Kbd {keys} />{/if}
						</div>
						<div class="box gap-xs">
							<text class="text-md weight-600 text-primary">{s.title}</text>
							<text class="text-sm text-muted truncate">{s.description}</text>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="box gap-sm">
			<SectionLabel label="Planned"><Pill label={PLANNED.length} /></SectionLabel>
			<div class="row wrap gap-md">
				{#each PLANNED as p (p.title)}
					<div class="wb-tile wb-card planned box gap-md" testId="planned-card">
						<div class="row ycenter xbetween">
							<div class="wb-glyph row xcenter ycenter radius-md"><Icon name={p.icon} tone="muted" /></div>
							<Pill label="Planned" tone="outline" />
						</div>
						<div class="box gap-xs">
							<text class="text-md weight-600 text-secondary">{p.title}</text>
							<text class="text-sm text-muted truncate">{p.description}</text>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="box gap-sm">
			<SectionLabel label="Shortcuts" />
			<div class="row wrap gap-lg">
				{#each SHORTCUTS as k (k.keys)}
					<div class="row ycenter gap-xs"><Kbd keys={k.keys} /><text class="text-sm text-secondary">{k.title}</text></div>
				{/each}
			</div>
		</div>
	</div>
</div>
