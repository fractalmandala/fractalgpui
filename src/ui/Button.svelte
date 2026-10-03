<script lang="ts">
	// The app's button: `.wb-btn` (src/styles/_own.sass) composed with fractalstyler
	// metrics. `variant` and `active` only toggle classes; nothing is styled inline.
	let {
		label,
		onclick,
		variant = 'default',
		active = false,
		testId
	}: {
		label: string;
		onclick: () => void;
		variant?: 'default' | 'primary' | 'ghost';
		active?: boolean;
		testId?: string;
	} = $props();
</script>

<div
	class="wb-btn row ycenter px-sm h-bs radius-sm text-sm"
	class:primary={variant === 'primary'}
	class:ghost={variant === 'ghost'}
	class:active
	hitbox="self"
	{testId}
	{onclick}
>
	<text>{label}</text>
</div>
