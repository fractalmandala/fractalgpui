<script lang="ts">
	import { dock, open_view, shown_root } from '../kernel/dock/dock.svelte.ts';
	import { leaves } from '../kernel/dock/tree.ts';
	import { views } from '../kernel/views.svelte.ts';
	import Button from '../ui/Button.svelte';
	import DockNode from './DockNode.svelte';

	// The dock: renders the layout tree (kernel/dock/tree.ts), or just the zoomed subtree.
	// An empty tree (every tab closed) offers each view as a button.
	const root = $derived(shown_root());
	const empty = $derived(leaves(dock.root).length === 0);
</script>

<div class="box grow min0" testId="dock">
	{#if empty}
		<div class="wb-pane box grow min0 xcenter ycenter gap-md pad-md" testId="dock-empty">
			<text class="text-sm text-muted">Nothing is open. Open a view:</text>
			<div class="row wrap gap-sm">
				{#each views as v (v.id)}
					<Button label={v.title} testId={`dock-empty-${v.id}`} onclick={() => open_view(v.id)} />
				{/each}
			</div>
		</div>
	{:else}
		<DockNode node={root} />
	{/if}
</div>
