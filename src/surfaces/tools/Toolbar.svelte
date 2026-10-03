<script lang="ts">
	import { active_tool } from './state.svelte.ts';

	// section-main header actions: the selected tool's toolbar, if it has one.
	const Toolbar = $derived(active_tool().toolbar);
</script>

{#if Toolbar}<Toolbar />{/if}
