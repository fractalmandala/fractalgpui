<script lang="ts">
	import { design } from '../kernel/design.svelte.ts';
	import { status } from '../kernel/status.svelte.ts';
	import { active_surface, show_style_diagnostics } from '../kernel/surfaces.svelte.ts';


	const tool = $derived(active_surface());
</script>

<!-- section-main-footer: the status bar. The right side carries only the style-warning link. -->
<div class="section-main-footer row ycenter xbetween px-md" testId="section-main-footer">
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
		{#if design.report?.warnings.length}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="wb-status-link row ycenter" hitbox="self" testId="style-warnings" onclick={show_style_diagnostics}>
				<text class="text-warning">⚠ {design.report.warnings.length} style warning{design.report.warnings.length === 1 ? '' : 's'}</text>
			</div>
		{/if}
	</div>
</div>
