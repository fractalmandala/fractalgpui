<script lang="ts">
	// The app's button: `.wb-btn` (src/styles/_own.sass). `variant` and `active` only
	// toggle classes; nothing is styled inline. Primary is the green accent with white text.
	let {
		label,
		onclick,
		variant = 'default',
		active = false,
		testId
	}: {
		label: string;
		onclick: () => void;
		variant?: 'default' | 'primary' | 'ghost' | 'danger';
		active?: boolean;
		testId?: string;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="wb-btn row ycenter gap-xs"
	class:primary={variant === 'primary'}
	class:ghost={variant === 'ghost'}
	class:danger={variant === 'danger'}
	class:active
	hitbox="self"
	{testId}
	{onclick}
>
	<text>{label}</text>
</div>
