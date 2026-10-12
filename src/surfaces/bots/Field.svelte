<script lang="ts">
	// A labelled text field (single line, or a few rows when `rows` > 1). The owner keeps the value.
	let {
		label,
		value,
		onchange,
		placeholder = '',
		hint = '',
		rows = 1,
		disabled = false,
		testId
	}: { label: string; value: string; onchange: (v: string) => void; placeholder?: string; hint?: string; rows?: number; disabled?: boolean; testId: string } = $props();
</script>

<div class="box gap-xs">
	<text class="wb-label">{label}</text>
	{#if disabled}
		<text class="text-sm text-secondary" {testId}>{value || '—'}</text>
	{:else if rows > 1}
		<textarea
			class="wb-editor border radius-sm pad-sm text-sm"
			{testId}
			{placeholder}
			minRows={rows}
			maxRows={rows}
			{value}
			onchange={(e: { value: string }) => onchange(e.value)}
		></textarea>
	{:else}
		<input class="input" {testId} {placeholder} {value} onchange={(e: { value: string }) => onchange(e.value)} />
	{/if}
	{#if hint}<text class="text-xs text-muted">{hint}</text>{/if}
</div>
