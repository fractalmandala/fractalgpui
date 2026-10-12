<script lang="ts">
	import Icon from './Icon.svelte';
	import IconButton from './IconButton.svelte';

	// Input with a search icon and a clear button (model panels, provider modal).
	let {
		value,
		placeholder = 'Search',
		oninput,
		testId = 'search',
		focus = false
	}: {
		value: string;
		placeholder?: string;
		oninput: (value: string) => void;
		testId?: string;
		focus?: boolean;
	} = $props();
</script>

<div class="row ycenter gap-xs" {testId}>
	<Icon name="search" tone="muted" />
	<input
		class="input grow min0"
		testId={`${testId}-input`}
		{placeholder}
		{value}
		autofocus={focus}
		onchange={(e: { value: string }) => oninput(e.value)}
		onsubmit={() => {}}
	/>
	{#if value}
		<IconButton icon="x" testId={`${testId}-clear`} onclick={() => oninput('')} />
	{/if}
</div>
