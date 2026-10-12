<script lang="ts">
	import Pill from '../../../ui/Pill.svelte';
	import Field from '../Field.svelte';
	import { splitList } from '../draft.ts';
	import { editor } from '../state.svelte.ts';

	// Role ids this bot holds. The roles catalog and Agent Plugins arrive in a later stage; until then
	// a role is just an id you choose.
	const list = $derived(editor.draft ? splitList(editor.draft.roles) : []);
</script>

{#if editor.draft}
	<div class="box gap-md" testId="sec-roles">
		<text class="text-sm text-muted">Roles are ids from the roles catalog (coming with plugins). For now you can name them freely.</text>
		<Field label="Roles" hint="Comma-separated ids, e.g. researcher, writer" testId="ro-input" value={editor.draft.roles} onchange={(v) => editor.draft && (editor.draft.roles = v)} />
		<div class="row wrap gap-xs" testId="ro-list">
			{#each list as r (r)}<Pill label={r} />{:else}<text class="text-xs text-muted">No roles</text>{/each}
		</div>
	</div>
{/if}
