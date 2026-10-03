<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import { clear, copy_output, css_tool, load_sample, swap } from './state.svelte.ts';
</script>

<Button label="Sample" variant="ghost" testId="sample" onclick={() => load_sample()} />
<Button label="Clear" variant="ghost" testId="clear" onclick={clear} />
<Button label="Swap" icon="arrow-right-left" testId="swap" onclick={swap} />
<Button label={css_tool.direction === 'css-to-sass' ? 'Copy Sass' : 'Copy CSS'} icon="copy" variant="primary" testId="copy" onclick={copy_output} />
