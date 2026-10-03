<script lang="ts">
	// An on/off switch with an optional label to its left.
	let {
		checked,
		onchange,
		label,
		testId = 'toggle'
	}: { checked: boolean; onchange: (checked: boolean) => void; label?: string; testId?: string } = $props();
</script>

<div class="wb-toggle-row row ycenter xbetween gap-sm" hitbox="self" {testId} onclick={() => onchange(!checked)}>
	{#if label}<text class="text-sm text-primary">{label}</text>{/if}
	<div class="wb-toggle row ycenter" class:on={checked}>
		<div class="wb-toggle-knob"></div>
	</div>
</div>
