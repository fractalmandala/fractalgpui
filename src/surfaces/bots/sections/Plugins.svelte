<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import FolderPicker from '../../../ui/FolderPicker.svelte';
	import Toggle from '../../../ui/Toggle.svelte';
	import { splitList } from '../draft.ts';
	import { editor } from '../state.svelte.ts';
	import { catalog, chooseCatalogDir, ensureCatalog, reloadCatalog } from '../catalog.svelte.ts';

	// Installed Agent Plugins (1.0.0 layout: plugin.json, skills/*/SKILL.md, mcp.json) from the
	// plugins folder. Enabling one gives this bot its skills (listed in the prompt, read with
	// skill_read). MCP servers are listed only: the runtime cannot connect to them yet.
	ensureCatalog();
	let picking = $state(false);
	const on = $derived(editor.draft ? splitList(editor.draft.plugins) : []);
	const setOn = (id: string, yes: boolean) => editor.draft && (editor.draft.plugins = (yes ? [...on, id] : on.filter((x) => x !== id)).join(', '));
	const tid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-');
	const missing = $derived(on.filter((id) => !catalog.plugins.some((p) => p.id === id)));
</script>

{#if editor.draft}
	<div class="box gap-md" testId="sec-plugins">
		<div class="box gap-xs">
			<text class="wb-label">Plugins folder</text>
			<text class="text-xs text-muted truncate" testId="pl-dir">{catalog.dirs?.pluginsDir ?? ''}</text>
			<div class="row gap-sm">
				<Button label="Reload" variant="ghost" testId="pl-reload" onclick={reloadCatalog} />
				<Button label="Change folder" variant="ghost" testId="pl-dir-choose" onclick={() => (picking = true)} />
			</div>
		</div>
		{#each catalog.plugins as p (p.id)}
			<div class="box gap-xs" testId={`pl-${tid(p.id)}`}>
				<Toggle label={`${p.name}${p.version ? ` ${p.version}` : ''}`} testId={`pl-toggle-${tid(p.id)}`} checked={on.includes(p.id)} onchange={(v) => setOn(p.id, v)} />
				{#if p.description}<text class="text-xs text-muted">{p.description}</text>{/if}
				<text class="text-xs text-muted">Skills: {p.skills.length ? p.skills.map((s) => s.name).join(', ') : 'none'}</text>
				{#if p.mcp.length}
					<text class="text-xs text-muted" testId={`pl-mcp-${tid(p.id)}`}>MCP servers (listed, not connected yet): {p.mcp.map((m) => `${m.name} (${m.type})`).join(', ')}</text>
				{/if}
				{#each p.warnings as w (w)}<text class="text-xs text-danger">{w}</text>{/each}
			</div>
		{:else}
			<text class="text-xs text-muted" testId="pl-empty">
				No plugins installed. Put Agent Plugins in the folder above: one folder per plugin with a plugin.json (name and the 1.0.0 $schema), skills in skills/&lt;name&gt;/SKILL.md, and MCP servers in mcp.json. Then press Reload.
			</text>
		{/each}
		{#each missing as id (id)}
			<div class="row ycenter gap-sm">
				<text class="text-xs text-danger grow">Enabled plugin "{id}" is not in the folder.</text>
				<Button label="Remove" variant="ghost" onclick={() => setOn(id, false)} />
			</div>
		{/each}
	</div>
	{#if picking}
		<FolderPicker
			initial={catalog.dirs?.pluginsDir}
			title="Plugins folder"
			onchoose={(path) => {
				chooseCatalogDir('pluginsDir', path);
				picking = false;
			}}
			onclose={() => (picking = false)}
			testId="pl-picker"
		/>
	{/if}
{/if}
