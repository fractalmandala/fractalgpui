<script lang="ts">
	import Kbd from '../../ui/Kbd.svelte';
	import { all_commands } from '../../kernel/commands.svelte.ts';

	// Shortcuts (§9.4): every command that has a keystroke, grouped by area,
	// generated from the registry — never a hand-maintained table.
	function groups(): { group: string; commands: { id: string; title: string; keys: string }[] }[] {
		const seen = new Map<string, { id: string; title: string; keys: string }[]>();
		for (const c of all_commands()) {
			if (!c.keys) continue;
			const g = c.group ?? 'General';
			if (!seen.has(g)) seen.set(g, []);
			seen.get(g)?.push({ id: c.id, title: c.title, keys: c.keys });
		}
		return [...seen.entries()].map(([group, commands]) => ({ group, commands }));
	}
</script>

<div class="box gap-md" testId="set-shortcuts">
	<text class="text-lg weight-600 text-primary">Shortcuts</text>
	{#each groups() as g (g.group)}
		<div class="box gap-xs">
			<text class="text-xs text-muted px-sm">{g.group}</text>
			{#each g.commands as c (c.id)}
				<div class="row ycenter xbetween gap-sm px-sm">
					<text class="text-sm text-primary grow truncate">{c.title}</text>
					<Kbd keys={c.keys} />
				</div>
			{/each}
		</div>
	{/each}
</div>
