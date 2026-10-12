<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import { editor, loadActivity, selectedBot } from '../state.svelte.ts';

	// The bot's audit log (newest first, last 60 rows): every action is written before it runs.
	const sel = $derived(selectedBot());
	$effect(() => {
		if (sel) loadActivity();
	});
	const time = (ts: number) => new Date(ts).toLocaleTimeString();
</script>

<div class="box gap-md" testId="sec-activity">
	<div class="row ycenter xbetween">
		<text class="text-sm text-muted">Append-only audit log for this bot.</text>
		<Button label="Refresh" variant="ghost" testId="ac-refresh" onclick={loadActivity} />
	</div>
	{#each editor.audit as row, i (i)}
		<div class="row gap-sm" testId={`ac-row-${i}`}>
			<text class="text-xs text-muted shrink-0">{time(row.ts)}</text>
			<text class="text-xs text-secondary shrink-0">{row.phase}</text>
			<text class="text-xs text-primary shrink-0">{row.tool}</text>
			<text class="text-xs text-secondary grow min0 truncate">{row.summary}</text>
		</div>
	{:else}
		<text class="text-sm text-muted" testId="ac-empty">No activity yet.</text>
	{/each}
</div>
