<script lang="ts">
	import { pretty } from '../kernel/keymap.ts';

	// A keystroke hint, e.g. `cmd-k` → ⌘K.
	let { keys }: { keys: string } = $props();
</script>

<div class="row ycenter raised radius-xs px-xs text-xs text-secondary shrink-0">
	<text>{pretty(keys)}</text>
</div>
