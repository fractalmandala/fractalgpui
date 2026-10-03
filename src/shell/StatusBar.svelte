<script lang="ts">
	import { design } from '../kernel/design.svelte.ts';
	import { settings } from '../kernel/settings.svelte.ts';
	import { status } from '../kernel/status.svelte.ts';
	import { active_tool } from '../kernel/tools.svelte.ts';

	const tool = $derived(active_tool());
	const styles = $derived(design.report ? `${design.report.registered} rules · fractalstyler ${design.report.mode}` : 'no styles');
</script>

<div class="row ycenter xbetween gap-md px-md h-bs panel bt text-xs text-muted shrink-0" testId="status-bar">
	<div class="row ycenter gap-md min0">
		<text class="text-secondary">{tool.title}</text>
		{#if status.message}
			<text
				testId="status-message"
				class:text-success={status.tone === 'success'}
				class:text-danger={status.tone === 'danger'}
				class:text-primary={status.tone === 'info'}>{status.message}</text
			>
		{/if}
	</div>
	<div class="row ycenter gap-md">
		<text>{styles}</text>
		<text>{settings.theme}</text>
	</div>
</div>
