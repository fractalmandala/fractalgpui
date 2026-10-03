<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';
	import { design } from './kernel/design.svelte.ts';
	import { settings } from './kernel/settings.svelte.ts';
	import Shell from './shell/Shell.svelte';

	// fractalstyler's tokens for the current mode; one call restyles every var() user.
	$effect(() => set_css_vars(design.tokens[settings.theme]));
</script>

<Shell />
