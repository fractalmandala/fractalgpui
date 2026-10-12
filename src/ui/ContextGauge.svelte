<script lang="ts">
	import Icon from './Icon.svelte';

	// The composer's context gauge (§4.1, §0.3 fallback): an icon plus the
	// percent-free number until the native canvas/shape API lands. Clicking
	// opens the usage popover.
	let {
		left,
		percent,
		onclick,
		testId = 'gauge'
	}: {
		left: number;
		percent: number;
		onclick: () => void;
		testId?: string;
	} = $props();

	const tone = (p: number): 'muted' | 'secondary' | 'accent' => (p >= 90 ? 'muted' : p >= 70 ? 'secondary' : 'accent');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="row ycenter gap-xs" hitbox="self" {testId} {onclick}>
	<Icon name="gauge" tone={tone(percent)} />
	<text class="text-sm text-secondary">{left}</text>
</div>
