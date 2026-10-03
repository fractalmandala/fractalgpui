<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { close_palette, palette, run_selected, search, set_query } from '../kernel/commands.svelte.ts';
	import Kbd from '../ui/Kbd.svelte';

	const results = $derived(search(palette.query));

	function pick(index: number) {
		palette.index = index;
		run_selected();
	}
</script>

<Portal>
	<div class="wb-scrim box xcenter" hitbox="self" testId="palette-scrim" onclick={close_palette}>
		<!-- The empty handler keeps clicks inside the dialog from reaching the scrim. -->
		<div class="wb-palette box ta-l raised border radius-md" hitbox="self" testId="palette" onclick={() => {}}>
			<div class="pad-sm bb">
				<input
					class="input"
					testId="palette-input"
					placeholder="Type a command…"
					autofocus
					value={palette.query}
					onchange={(e: { value: string }) => set_query(e.value)}
					onsubmit={() => run_selected()}
				/>
			</div>
			<div class="wb-palette-list box gap-xs pad-xs scroll-y">
				{#each results as c, i (c.id)}
					<div
						class="wb-palette-item row ycenter gap-sm px-sm h-md radius-sm"
						class:active={i === palette.index}
						hitbox="self"
						testId={`cmd-${c.id}`}
						onclick={() => pick(i)}
					>
						{#if c.group}<text class="text-xs text-muted shrink-0">{c.group}</text>{/if}
						<text class="grow min0 truncate text-sm text-primary">{c.title}</text>
						{#if c.keys}<Kbd keys={c.keys} />{/if}
					</div>
				{:else}
					<div class="row ycenter px-sm h-md"><text class="text-sm text-muted">No matching commands</text></div>
				{/each}
			</div>
		</div>
	</div>
</Portal>
