<script lang="ts">
	import { active_tool } from './state.svelte.ts';

	// section-main body: the selected tool.
	const tool = $derived(active_tool());
</script>

<div class="box full min0" testId={`tool-${tool.id}`}>
	<tool.component />
</div>
