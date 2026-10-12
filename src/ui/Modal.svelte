<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';

	// Scrim + dialog for the Add-provider modal (the CommandPalette pattern:
	// scrim click closes, clicks inside the dialog do not; Esc closes).
	let {
		title,
		onclose,
		testId = 'modal',
		children,
		footer
	}: {
		title: string;
		onclose: () => void;
		testId?: string;
		children?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<Portal>
	<div class="wb-scrim box xcenter" hitbox="self" testId={`${testId}-scrim`} onclick={onclose}>
		<div
			class="wb-palette box ta-l raised border radius-md"
			hitbox="self"
			testId={testId}
			autofocus
			onclick={() => {}}
			onkeydown={(e: { key?: string }) => {
				if ((e.key ?? '').toLowerCase() === 'escape') onclose();
			}}
		>
			<div class="row ycenter xbetween gap-sm pad-sm bb">
				<text class="text-md weight-600 text-primary">{title}</text>
				<IconButton icon="x" testId={`${testId}-close`} onclick={onclose} />
			</div>
			<div class="box gap-md pad-md scroll-y">
				{#if children}{@render children()}{/if}
			</div>
			{#if footer}
				<div class="row ycenter gap-sm pad-sm">
					<div class="grow"></div>
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
</Portal>
