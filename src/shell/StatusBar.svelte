<script lang="ts">
	import { design } from '../kernel/design.svelte.ts';
	import { settings } from '../kernel/settings.svelte.ts';
	import { status } from '../kernel/status.svelte.ts';
	import { active_surface, show_style_diagnostics } from '../kernel/surfaces.svelte.ts';

	const tool = $derived(active_surface());
	const styles = $derived(design.report ? `${design.report.registered} rules · fractalstyler ${design.report.mode}` : 'no styles');
</script>

<div class="wb-statusbar row ycenter xbetween gap-md px-md bt text-xs text-muted" testId="status-bar">
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
			<div class="wb-status-link row ycenter" hitbox="self" testId="style-warnings" onclick={show_style_diagnostics}>
				<text class="text-warning">⚠ {design.report.warnings.length} style warning{design.report.warnings.length === 1 ? '' : 's'}</text>
			</div>
		{/if}
		<text>{styles}</text>
		<text>{settings.theme}</text>
	</div>
</div>
