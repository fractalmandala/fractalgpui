<script lang="ts">
	import { switch_to } from '../../kernel/settings.svelte.ts';
	import Icon from '../../ui/Icon.svelte';
	import Kbd from '../../ui/Kbd.svelte';
	import { SURFACES } from '../index.ts';

	// Every surface but Home, as a grid of cards, in rail order (so the shortcut is index + 1).
	const surfaces = SURFACES.map((s, i) => ({ s, keys: i < 9 ? `cmd-${i + 1}` : null })).filter(({ s }) => s.id !== 'home');
</script>

<div class="box full min0 scroll-y">
	<div class="row wrap gap-md pad-xl">
		{#each surfaces as { s, keys } (s.id)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="wb-tile wb-card box gap-md" hitbox="self" testId={`home-open-${s.id}`} onclick={() => switch_to(s.id)}>
				<div class="row ycenter xbetween">
					<div class="wb-glyph row xcenter ycenter radius-md"><Icon name={s.icon} tone="primary" /></div>
				</div>
				<div class="box gap-xs">
					<text class="text-md weight-600 text-primary">{s.title}</text>
					<text class="text-sm text-muted truncate">{s.description}</text>
					<h3>XsXs</h3>
				</div>
			</div>
		{/each}
	</div>
</div>
