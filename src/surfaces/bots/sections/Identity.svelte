<script lang="ts">
	import Button from '../../../ui/Button.svelte';
	import Field from '../Field.svelte';
	import { applyIdentity, editor, selectedBot } from '../state.svelte.ts';

	// The identity is locked after creation. Editing it takes an explicit unlock and an explicit apply;
	// it is audited and is not part of Save.
	const sel = $derived(selectedBot());
	const created = $derived(sel ? new Date(sel.bot.identity.createdAt).toLocaleString() : '');
</script>

{#if sel}
	<div class="box gap-md" testId="sec-identity">
		<text class="text-sm text-muted">Locked after creation. It defines who this bot is across every session.</text>
		{#if editor.identity}
			<Field label="Name" testId="id-name" value={editor.identity.name} onchange={(v) => editor.identity && (editor.identity.name = v)} />
			<Field label="Role" testId="id-role" value={editor.identity.role} onchange={(v) => editor.identity && (editor.identity.role = v)} />
			<Field label="Mission" testId="id-mission" rows={3} value={editor.identity.mission} onchange={(v) => editor.identity && (editor.identity.mission = v)} />
			<div class="row gap-sm">
				<Button label="Apply identity change" variant="danger" testId="id-apply" onclick={() => void applyIdentity()} />
				<Button label="Cancel" variant="ghost" testId="id-cancel" onclick={() => (editor.identity = null)} />
			</div>
		{:else}
			<Field label="Name" testId="id-name" value={sel.bot.identity.name} disabled onchange={() => {}} />
			<Field label="Role" testId="id-role" value={sel.bot.identity.role} disabled onchange={() => {}} />
			<Field label="Mission" testId="id-mission" value={sel.bot.identity.mission} disabled onchange={() => {}} />
			<Field label="Created" testId="id-created" value={created} disabled onchange={() => {}} />
			<Field label="Bot id" testId="id-id" value={sel.id} disabled onchange={() => {}} />
			<div class="row">
				<Button
					label="Unlock to edit"
					testId="id-unlock"
					onclick={() => (editor.identity = { name: sel.bot.identity.name, role: sel.bot.identity.role, mission: sel.bot.identity.mission })}
				/>
			</div>
		{/if}
	</div>
{/if}
