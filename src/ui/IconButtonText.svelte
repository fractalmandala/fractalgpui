<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	// The app's button: `.wb-btn` (src/styles/_own.sass). `variant` and `active` only
	// toggle classes; nothing is styled inline. Primary is the green accent with white text.
	let {
		label,
        icon,
		onclick,
		variant = 'default',
		active = false,
		testId
	}: {
        icon: IconName,
		label: string;
		onclick: () => void;
		variant?: 'default' | 'primary' | 'ghost';
		active?: boolean;
		testId?: string;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="wb-icon-btn-text row ycenter gap-xs"
	class:primary={variant === 'primary'}
	class:ghost={variant === 'ghost'}
	class:active
	hitbox="self"
	{testId}
	{onclick}
>
    <Icon name={icon} tone={active ? 'primary' : 'secondary'} />
	<text>{label}</text>
</div>
