<script lang="ts">
	import type { Tab } from './types.ts';

	// A row of underline tabs. The owner keeps the value (usually in surface state).

	let {
		tabs,
		value,
		onchange,
		testId = 'tabs'
	}: { tabs: Tab[]; value: string; onchange: (id: string) => void; testId?: string } = $props();
</script>

<div class="wb-tabs row ycenter gap-xs px-md" {testId}>
	{#each tabs as tab (tab.id)}
		<div
			class="wb-tab row ycenter gap-xs"
			class:active={tab.id === value}
			hitbox="self"
			testId={`${testId}-${tab.id}`}
			onclick={() => onchange(tab.id)}
		>
			<text>{tab.label}</text>
			{#if tab.badge != null}<div class="wb-pill row ycenter"><text>{tab.badge}</text></div>{/if}
		</div>
	{/each}
</div>
