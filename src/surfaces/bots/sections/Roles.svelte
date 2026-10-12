<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import FolderPicker from '../../../ui/FolderPicker.svelte';
	import { splitList } from '../draft.ts';
	import { editor } from '../state.svelte.ts';
	import { catalog, chooseCatalogDir, ensureCatalog, reloadCatalog } from '../catalog.svelte.ts';

	// Roles come only from the user's SKILL.md files in the roles folder. A bot holds any number of
	// them; their instructions go into the system prompt of the bot's chats (after Save).
	ensureCatalog();
	let picking = $state(false);
	let open = $state<string | null>(null);
	const held = $derived(editor.draft ? splitList(editor.draft.roles) : []);
	const available = $derived(catalog.roles.filter((r) => !held.includes(r.id)));
	const roleOf = (id: string) => catalog.roles.find((r) => r.id === id);
	const setHeld = (ids: string[]) => editor.draft && (editor.draft.roles = ids.join(', '));
	const tid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-');
</script>

{#if editor.draft}
	<div class="box gap-md" testId="sec-roles">
		<div class="box gap-xs">
			<text class="wb-label">Roles folder</text>
			<text class="text-xs text-muted truncate" testId="ro-dir">{catalog.dirs?.rolesDir ?? ''}</text>
			<div class="row gap-sm">
				<Button label="Reload" variant="ghost" testId="ro-reload" onclick={reloadCatalog} />
				<Button label="Change folder" variant="ghost" testId="ro-dir-choose" onclick={() => (picking = true)} />
			</div>
		</div>

		<text class="wb-label">This bot's roles</text>
		<div class="box gap-xs" testId="ro-held">
			{#each held as id (id)}
				{@const r = roleOf(id)}
				<div class="box gap-xs" testId={`ro-held-${tid(id)}`}>
					<div class="row ycenter gap-sm">
						<text class="text-sm text-primary grow truncate">{r?.name ?? id}</text>
						{#if !r}<text class="text-xs text-danger">missing from the folder</text>{/if}
						{#if r}<Button label={open === id ? 'Hide' : 'View'} variant="ghost" testId={`ro-view-${tid(id)}`} onclick={() => (open = open === id ? null : id)} />{/if}
						<Button label="Remove" variant="ghost" testId={`ro-remove-${tid(id)}`} onclick={() => setHeld(held.filter((x) => x !== id))} />
					</div>
					{#if r && open === id}<text class="text-xs text-muted" testId={`ro-body-${tid(id)}`}>{r.body}</text>{/if}
				</div>
			{:else}
				<text class="text-xs text-muted">No roles assigned.</text>
			{/each}
		</div>

		<text class="wb-label">Catalog</text>
		<div class="box gap-xs" testId="ro-catalog">
			{#each available as r (r.id)}
				<div class="box gap-xs" testId={`ro-cat-${tid(r.id)}`}>
					<div class="row ycenter gap-sm">
						<div class="box grow min0">
							<text class="text-sm text-primary truncate">{r.name}</text>
							{#if r.description}<text class="text-xs text-muted truncate">{r.description}</text>{/if}
						</div>
						<Button label={open === r.id ? 'Hide' : 'View'} variant="ghost" testId={`ro-view-${tid(r.id)}`} onclick={() => (open = open === r.id ? null : r.id)} />
						<Button label="Assign" testId={`ro-assign-${tid(r.id)}`} onclick={() => setHeld([...held, r.id])} />
					</div>
					{#if open === r.id}<text class="text-xs text-muted" testId={`ro-body-${tid(r.id)}`}>{r.body}</text>{/if}
				</div>
			{:else}
				<text class="text-xs text-muted" testId="ro-empty">
					{catalog.roles.length
						? 'Every role in the folder is assigned.'
						: 'No role templates yet. Put SKILL.md-style files in the roles folder above: one folder per role with a SKILL.md inside (or a single <role>.md file), with name and description in the front matter and the instructions below. Then press Reload.'}
				</text>
			{/each}
		</div>
	</div>
	{#if picking}
		<FolderPicker
			initial={catalog.dirs?.rolesDir}
			title="Roles folder"
			onchoose={(path) => {
				chooseCatalogDir('rolesDir', path);
				picking = false;
			}}
			onclose={() => (picking = false)}
			testId="ro-picker"
		/>
	{/if}
{/if}
