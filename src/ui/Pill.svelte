<script lang="ts">
	// A small rounded badge.
	let { label, tone = 'neutral' }: { label: string | number; tone?: 'neutral' | 'accent' | 'outline' } = $props();
</script>

<div class="wb-pill row ycenter" class:accent={tone === 'accent'} class:outline={tone === 'outline'}>
	<text>{label}</text>
</div>
