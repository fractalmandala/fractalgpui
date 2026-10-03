<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';
	import { design } from './kernel/design.svelte.ts';
	import { settings } from './kernel/settings.svelte.ts';
	import { styled_tokens } from './kernel/style.svelte.ts';
	import Shell from './shell/Shell.svelte';

	// fractalstyler's tokens for the current mode, with the style editor's choices;
	// one call restyles every var() user.
	$effect(() => set_css_vars(styled_tokens(settings.theme, undefined, design.tokens[settings.theme], design.base[settings.theme])));
</script>

<Shell />
