<script lang="ts">
	import Pill from '../../ui/Pill.svelte';
	import { css_tool, round_trip } from './state.svelte.ts';

	// Round trip: the input as dart-sass prints it, against the Sass output compiled back.
	const rt = $derived(round_trip(css_tool));
</script>

<div class="box grow min0 gap-xs">
	<div class="row ycenter xbetween">
		<text class="wb-label">input.css ↔ output.sass compiled</text>
		{#if rt.ok}
			<Pill tone={rt.patch ? 'outline' : 'accent'} label={rt.patch ? `+${rt.added} −${rt.removed}` : 'Identical'} />
		{/if}
	</div>
	<div class="box grow min0 sunken border radius-sm scroll-y" testId="diff-view">
		{#if !rt.ok}
			<text class="text-sm text-danger pad-sm" testId="diff-error">{rt.error}</text>
		{:else if rt.patch}
			<diff class="mono text-sm" patch={rt.patch} testId="diff-patch"></diff>
		{:else}
			<text class="text-sm text-secondary pad-sm" testId="diff-identical">Compiling the Sass gives back exactly the input CSS.</text>
		{/if}
	</div>
</div>
