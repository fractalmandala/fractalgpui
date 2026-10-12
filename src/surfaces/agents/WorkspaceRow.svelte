<script lang="ts">
	import Icon from '../../ui/Icon.svelte';
	import { workspaceInfo } from '../../kernel/pi/workspace.ts';

	// One folder context: icon + name + live git branch (§1.20, §2.5). The
	// branch reads off the render path into local state — cached 30s, never
	// throws, nothing when the folder is not a work tree.
	let { path, name }: { path: string; name?: string } = $props();

	let branch = $state<string | null>(null);

	$effect(() => {
		try {
			branch = workspaceInfo(path).branch;
		} catch {
			branch = null;
		}
	});
</script>

<div class="row ycenter gap-xs min0">
	<Icon name="folder" tone="muted" />
	<text class="text-sm text-secondary truncate">{name ?? path}</text>
	{#if branch}
		<Icon name="git-branch" tone="muted" />
		<text class="text-xs text-muted truncate">{branch}</text>
	{/if}
</div>
