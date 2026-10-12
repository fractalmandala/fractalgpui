<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	// The composer's model/thinking chip: label plus a caret, opens a panel.
	let {
		label,
		icon,
		onclick,
		testId = 'chip'
	}: {
		label: string;
		icon?: IconName;
		onclick: () => void;
		testId?: string;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-chip row ycenter gap-xs" hitbox="self" {testId} {onclick}>
	{#if icon}<Icon name={icon} tone="inherit" />{/if}
	<text class="truncate">{label}</text>
	<Icon name="chevron-down" tone="inherit" />
</div>
