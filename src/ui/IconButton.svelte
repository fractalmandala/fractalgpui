<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	// A square, borderless icon control (sidebar toggles, panel actions).
	let {
		icon,
		onclick,
		active = false,
		testId
	}: { icon: IconName; onclick: () => void; active?: boolean; testId?: string } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wb-icon-btn row xcenter ycenter" class:active hitbox="self" {testId} {onclick}>
	<Icon name={icon} tone={active ? 'primary' : 'secondary'} />
</div>
