<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import { clear, copy_output, current_file, load_sample } from './state.svelte.ts';

	const name = $derived(current_file()?.name);
</script>

<Button label="Sample" variant="ghost" testId="r2s-sample" onclick={() => load_sample()} />
<Button label="Clear" variant="ghost" testId="r2s-clear" onclick={clear} />
<Button label={name ? `Copy ${name}` : 'Copy Svelte'} icon="copy" variant="primary" testId="r2s-copy" onclick={copy_output} />
