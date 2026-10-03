<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import { clear, copy_output, load_sample } from './state.svelte.ts';
</script>

<Button label="Sample" variant="ghost" testId="sample" onclick={load_sample} />
<Button label="Clear" variant="ghost" testId="clear" onclick={clear} />
<Button label="Copy Sass" icon="copy" variant="primary" testId="copy" onclick={copy_output} />
