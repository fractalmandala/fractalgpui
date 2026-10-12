<script lang="ts">
	import { avatarFallback } from '../kernel/pi/bots/meta.ts';

	// A bot's avatar: its image when one is set, else the generated tile (the name's initial
	// on a colour hashed from the id and name). The fallback colour is data, so it is the one
	// inline style here (like the colour picker's swatches).
	let { id, name, avatar, large = false, testId }: { id: string; name: string; avatar?: string; large?: boolean; testId?: string } = $props();

	const fb = $derived(avatarFallback(id, name));
</script>

{#if avatar}
	<img class="wb-avatar" class:wb-avatar-lg={large} src={avatar} {testId} />
{:else}
	<div class="wb-avatar row xcenter ycenter" class:wb-avatar-lg={large} style={`background-color: ${fb.background}; color: ${fb.foreground}`} {testId}>
		<text>{fb.initial}</text>
	</div>
{/if}
