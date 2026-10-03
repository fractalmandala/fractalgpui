<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	// The app's button: `.wb-btn` (src/styles/_own.sass). `variant` and `active` only
	// toggle classes; nothing is styled inline. Primary is the green accent with black text.
	let {
		label,
		onclick,
		variant = 'default',
		icon,
		active = false,
		testId
	}: {
		label: string;
		onclick: () => void;
		variant?: 'default' | 'primary' | 'ghost';
		icon?: IconName;
		active?: boolean;
		testId?: string;
	} = $props();
</script>

<div
	class="wb-btn row ycenter gap-xs"
	class:primary={variant === 'primary'}
	class:ghost={variant === 'ghost'}
	class:active
	hitbox="self"
	{testId}
	{onclick}
>
	{#if icon}<Icon name={icon} size="sm" tone={variant === 'primary' ? 'on-accent' : 'secondary'} />{/if}
	<text>{label}</text>
</div>
