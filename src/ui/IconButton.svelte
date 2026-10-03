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

<div class="wb-icon-btn row xcenter ycenter" class:active hitbox="self" {testId} {onclick}>
	<Icon name={icon} tone={active ? 'primary' : 'secondary'} />
</div>
