<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import ContextMenu from '../../ui/ContextMenu.svelte';
	import IconButton from '../../ui/IconButton.svelte';
	import SectionLabel from '../../ui/SectionLabel.svelte';
	import Toggle from '../../ui/Toggle.svelte';
	import { flash } from '../../kernel/status.svelte.ts';
	import { piModels } from '../../kernel/pi/harness.svelte.ts';
	import {
		credentialBag,
		customProviders,
		isProviderEnabled,
		modelDefaults,
		removeCustomProvider,
		setProviderEnabled,
		type CustomProviderDef
	} from '../../kernel/pi/models.ts';
	import { keySource } from '../../kernel/pi/providers.ts';
	import ModelPanel from '../agents/ModelPanel.svelte';
	import AddProvider from './AddProvider.svelte';

	// Model configuration (§7.1–§7.5): the new-session default and every
	// provider with its enable switch, key state, and custom endpoints.
	let changingDefault = $state(false);
	let adding = $state(false);
	let editingDef = $state<CustomProviderDef | null>(null);
	let customMenu = $state<string | null>(null);

	interface ProviderRow {
		id: string;
		name: string;
		host: string;
		models: number;
		added: boolean;
		enabled: boolean;
		keyText: string;
	}

	function rows(): ProviderRow[] {
		const customIds = new Set(customProviders().map((d) => d.id));
		const out: ProviderRow[] = [];
		for (const p of piModels().getProviders()) {
			let count = 0;
			try {
				count = piModels().getModels(p.id).length;
			} catch {
				count = 0;
			}
			const source = keySource(credentialBag, p.id);
			out.push({
				id: p.id,
				name: p.name ?? p.id,
				host: p.baseUrl ?? '',
				models: count,
				added: customIds.has(p.id),
				enabled: isProviderEnabled(p.id),
				keyText:
					source.kind === 'env'
						? source.env
						: source.kind === 'stored'
							? `${source.masked} in this app`
							: source.kind === 'oauth'
								? 'Subscription sign-in'
								: 'Not configured'
			});
		}
		return out;
	}

	const configuredCount = () => rows().filter((r) => r.keyText !== 'Not configured').length;

	function removeCustom(id: string) {
		customMenu = null;
		try {
			removeCustomProvider(piModels(), id);
			flash('Provider removed', 'success');
		} catch (err) {
			flash(`That didn't work: ${(err as Error).message}`, 'danger');
		}
	}
</script>

<div class="box gap-md" testId="set-models">
	<text class="text-lg weight-600 text-primary">Model configuration</text>
	<div class="box gap-xs">
		<div class="px-sm"><SectionLabel label="Defaults" /></div>
		<div class="row ycenter gap-sm px-sm">
			<div class="box grow min0">
				<text class="text-sm text-primary">Default model</text>
				<text class="text-xs text-muted truncate">{modelDefaults.provider} · {modelDefaults.modelId}</text>
			</div>
			<Button label="Change" testId="set-default-change" onclick={() => (changingDefault = !changingDefault)} />
		</div>
		{#if changingDefault}
			<ModelPanel
				provider={modelDefaults.provider}
				modelId={modelDefaults.modelId}
				onselect={(p, m) => {
					modelDefaults.provider = p;
					modelDefaults.modelId = m;
					changingDefault = false;
				}}
				onclose={() => (changingDefault = false)}
				testId="set-default-panel"
			/>
		{/if}
	</div>
	<div class="box gap-xs">
		<div class="row ycenter xbetween gap-sm px-sm">
			<SectionLabel label={`AI providers · ${configuredCount()} configured`} />
			<Button label="Add provider" variant="primary" testId="set-add" onclick={() => { editingDef = null; adding = true; }} />
		</div>
		{#each rows() as r (r.id)}
			<div class="box gap-xs px-sm" testId={`set-provider-${r.id}`}>
				<div class="row ycenter gap-sm">
					<div class="wb-glyph row xcenter ycenter shrink-0"><text class="text-sm text-secondary">{r.name.slice(0, 1).toUpperCase()}</text></div>
					<div class="box grow min0">
						<div class="row ycenter gap-xs">
							<text class="text-sm text-primary truncate">{r.name}</text>
							<text class="text-xs text-muted shrink-0">{r.added ? 'added' : 'shipped'}</text>
						</div>
						<text class="text-xs text-muted truncate">{r.host}{r.host ? ' · ' : ''}{r.models} models · {r.keyText}</text>
					</div>
					<Toggle checked={r.enabled} testId={`set-enable-${r.id}`} onchange={(on) => setProviderEnabled(r.id, on)} />
					{#if r.added}
						<IconButton
							icon="more-horizontal"
							testId={`set-provider-${r.id}-more`}
							onclick={() => (customMenu = customMenu === r.id ? null : r.id)}
						/>
					{/if}
				</div>
				{#if r.added && customMenu === r.id}
					<ContextMenu
						open
						items={[
							{ id: 'edit', label: 'Edit', icon: 'pencil' },
							{ id: 'remove', label: 'Remove', icon: 'trash-2', danger: true }
						]}
						onselect={(item) => {
							customMenu = null;
							if (item === 'edit') {
								editingDef = customProviders().find((d) => d.id === r.id) ?? null;
								adding = true;
							} else removeCustom(r.id);
						}}
						onclose={() => (customMenu = null)}
						testId={`set-provider-${r.id}-menu`}
					/>
				{/if}
			</div>
		{/each}
	</div>
</div>

{#if adding}
	<AddProvider
		editing={editingDef}
		onclose={() => {
			adding = false;
			editingDef = null;
		}}
		testId="set-add-provider"
	/>
{/if}
