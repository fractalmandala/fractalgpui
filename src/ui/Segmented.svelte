<script lang="ts" generics="T extends string">
	// A segmented control: one of a few options, all visible.
	let {
		options,
		value,
		onchange,
		testId = 'segmented'
	}: { options: { value: T; label: string }[]; value: T; onchange: (value: T) => void; testId?: string } = $props();
</script>

<div class="wb-seg row ycenter" {testId}>
	{#each options as option (option.value)}
		<div
			class="wb-seg-item row xcenter ycenter grow"
			class:active={option.value === value}
			hitbox="self"
			testId={`${testId}-${option.value}`}
			onclick={() => onchange(option.value)}
		>
			<text>{option.label}</text>
		</div>
	{/each}
</div>
