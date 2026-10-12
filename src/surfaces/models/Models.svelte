<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import SearchInput from '../../ui/SearchInput.svelte';
	import SectionLabel from '../../ui/SectionLabel.svelte';
	import Toggle from '../../ui/Toggle.svelte';
	import { piModels } from '../../kernel/pi/harness.svelte.ts';
	import { credentialBag, customProviders, isModelKept, keyEnvRef, maskedKey, resolveDefault } from '../../kernel/pi/models.ts';
	import { isProviderEnabled, setProviderEnabled } from '../../kernel/pi/models.ts';
	import { keyEnvFor } from '../../kernel/pi/providers.ts';
	import ModelPanel from '../agents/ModelPanel.svelte';
	import AddProvider from '../settings/AddProvider.svelte';
	import {
		checkLimits,
		currentChat,
		detected,
		kept,
		models_ui,
		openProvider,
		pickDefault,
		refreshEndpoint,
		removeKey,
		saveProviderKey,
		toggleEnvIgnore,
		toggleKeep,
		useEnvVar
	} from './state.svelte.ts';

	// Models & providers. Only models you KEEP appear in the pickers. Providers detected from your
	// environment contribute nothing until you keep one of their models (or you can ignore them).
	const num = (n: number) => n.toLocaleString('en-US');
	const pct = (p: number) => `${Math.round(p * 10) / 10}%`;
	const ROW_LIMIT = 40;
	const PROVIDER_PAGE = 30;
	const KEPT_LIMIT = 50;

	const keptList = $derived((void models_ui.rev, kept()));
	const found = $derived(detected());
	const dflt = $derived(resolveDefault(piModels()));
	const chat = $derived(currentChat());
	const snap = $derived(chat?.rows ? chat.usageSnapshot() : null);

	// The catalog can hold hundreds of providers. Only a bounded page of rows is ever built: the list is
	// searchable and grows by PROVIDER_PAGE on "Show more". Per-row details are computed for visible rows only.
	interface P {
		id: string;
		name: string;
		host: string;
		custom: boolean;
		models: number;
		keyText: string;
		enabled: boolean;
	}
	const allProviders = $derived.by(() => {
		void models_ui.rev;
		return piModels()
			.getProviders()
			.map((p) => ({ id: p.id, name: p.name ?? p.id, host: p.baseUrl ?? '' }));
	});
	const filtered = $derived.by(() => {
		const q = models_ui.providerSearch.trim().toLowerCase();
		return q ? allProviders.filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.host.toLowerCase().includes(q)) : allProviders;
	});
	const providers = $derived.by((): P[] => {
		void models_ui.rev;
		const custom = new Set(customProviders().map((d) => d.id));
		const bag = credentialBag.readAll(); // once for the page, not once per row
		return filtered.slice(0, models_ui.providerLimit).map((p) => {
			let count = 0;
			try {
				count = piModels().getModels(p.id).length;
			} catch {
				count = 0;
			}
			const stored = bag[p.id];
			const ref = keyEnvRef(p.id);
			const env = found.find((f) => f.providerId === p.id);
			return {
				...p,
				custom: custom.has(p.id),
				models: count,
				enabled: isProviderEnabled(p.id),
				keyText: ref ? `reads $${ref}` : stored?.type === 'api_key' ? `${maskedKey(p.id)} (key file)` : stored?.type === 'oauth' ? 'subscription sign-in' : env ? `detected from env (${env.env})` : 'no key'
			};
		});
	});

	const catalog = $derived.by(() => {
		const id = models_ui.open;
		if (!id) return { rows: [] as { id: string; name: string }[], total: 0 };
		let all: { id: string; name?: string }[] = [];
		try {
			all = piModels().getModels(id) as unknown as typeof all;
		} catch {
			all = [];
		}
		const q = models_ui.search.trim().toLowerCase();
		const hit = all.filter((m) => !q || m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q));
		return { rows: hit.slice(0, ROW_LIMIT).map((m) => ({ id: m.id, name: m.name ?? m.id })), total: hit.length };
	});
</script>

<div class="box gap-md pad-md scroll-y" testId="surface-models">
	{#if models_ui.message}
		<text class="text-sm" class:text-danger={models_ui.message.kind === 'danger'} class:text-primary={models_ui.message.kind === 'success'} testId="md-message">
			{models_ui.message.kind === 'danger' ? '✕ ' : '✓ '}{models_ui.message.text}
		</text>
	{/if}

	<div class="box gap-xs">
		<SectionLabel label={`Kept models · ${keptList.length}`} />
		<text class="text-xs text-muted">Only these appear in the model picker. Nothing is chosen for you.</text>
		{#each keptList.slice(0, KEPT_LIMIT) as m (m.provider + '/' + m.id)}
			<div class="row ycenter gap-sm px-sm" testId={`md-kept-${m.provider}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, '-')}>
				<text class="text-sm text-primary grow min0 truncate">{m.name}</text>
				<text class="text-xs text-muted shrink-0">{m.providerName}{m.unavailable ? ` · ${m.unavailable}` : ''}</text>
				<Button label="Remove" variant="ghost" testId={`md-unkeep-${m.provider}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, '-')} onclick={() => toggleKeep(m.provider, m.id, false)} />
			</div>
		{:else}
			<text class="text-sm text-muted px-sm" testId="md-kept-empty">No kept models yet. Open a provider below, search its models and keep the ones you want.</text>
		{/each}
		{#if keptList.length > KEPT_LIMIT}<text class="text-xs text-muted px-sm" testId="md-kept-more">Showing {KEPT_LIMIT} of {keptList.length} kept models.</text>{/if}
		<div class="row ycenter gap-sm px-sm">
			<div class="box grow min0">
				<text class="text-sm text-primary">New sessions start on</text>
				<text class="text-xs text-muted truncate" testId="md-default">{dflt.provider ? `${dflt.provider}/${dflt.modelId}` : 'nothing yet: keep a model first'}</text>
			</div>
			<Button label="Change" testId="md-default-change" onclick={() => (models_ui.picking = !models_ui.picking)} />
		</div>
		{#if models_ui.picking}
			<ModelPanel provider={dflt.provider} modelId={dflt.modelId} onselect={pickDefault} onclose={() => (models_ui.picking = false)} testId="md-default-panel" />
		{/if}
	</div>

	{#if found.length}
		<div class="box gap-xs" testId="md-env">
			<SectionLabel label="Detected from env" />
			<text class="text-xs text-muted">Keys already in your environment. They contribute no models until you keep some, and ignoring one hides its models.</text>
			{#each found as f (f.providerId)}
				<div class="row ycenter gap-sm px-sm" testId={`md-env-${f.providerId}`}>
					<div class="box grow min0">
						<text class="text-sm text-primary truncate">{f.name}</text>
						<text class="text-xs text-muted truncate">detected from env · {f.env} · {f.keptCount} kept</text>
					</div>
					<Toggle checked={f.ignored} label="Ignore" testId={`md-ignore-${f.providerId}`} onchange={(on) => toggleEnvIgnore(f.providerId, on)} />
				</div>
			{/each}
		</div>
	{/if}

	<div class="box gap-xs">
		<div class="row ycenter xbetween gap-sm">
			<SectionLabel label={`Providers · ${filtered.length}`} />
			<Button label="Add by link + key" variant="primary" testId="md-add" onclick={() => (models_ui.adding = true)} />
		</div>
		<SearchInput value={models_ui.providerSearch} placeholder={`Search ${allProviders.length} providers`} oninput={(v) => { models_ui.providerSearch = v; models_ui.providerLimit = PROVIDER_PAGE; }} testId="md-provider-search" />
		{#each providers as p (p.id)}
			<div class="box gap-xs" testId={`md-provider-${p.id}`}>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="wb-row-item row ycenter gap-sm" class:active={models_ui.open === p.id} hitbox="self" testId={`md-open-${p.id}`} onclick={() => openProvider(p.id)}>
					<div class="box grow min0">
						<text class="text-sm text-primary truncate">{p.name}{p.custom ? ' · added' : ''}</text>
						<text class="text-xs text-muted truncate">{p.models} models · {p.keyText}{p.enabled ? '' : ' · off'}</text>
					</div>
				</div>
				{#if models_ui.open === p.id}
					<div class="box gap-sm pad-sm" testId={`md-detail-${p.id}`}>
						<Toggle checked={p.enabled} label="Provider on" testId={`md-enable-${p.id}`} onchange={(on) => setProviderEnabled(p.id, on)} />
						<div class="box gap-xs">
							<text class="wb-label">API key</text>
							<input
								class="input"
								testId={`md-key-${p.id}`}
								placeholder="Paste a key (saved as an owner-only file)"
								value={models_ui.keyDraft}
								onchange={(e: { value: string }) => (models_ui.keyDraft = e.value)}
								onsubmit={() => saveProviderKey(p.id)}
							/>
							<div class="row gap-sm wrap">
								<Button label="Save key" testId={`md-key-save-${p.id}`} onclick={() => saveProviderKey(p.id)} />
								<Button label="Remove key" variant="ghost" testId={`md-key-remove-${p.id}`} onclick={() => removeKey(p.id)} />
							</div>
							<text class="text-xs text-muted">Or read it from an environment variable (nothing is copied):</text>
							<div class="row gap-sm">
								<input
									class="input grow"
									testId={`md-env-name-${p.id}`}
									placeholder={keyEnvFor(p.id) ?? 'MY_API_KEY'}
									value={models_ui.envDraft}
									onchange={(e: { value: string }) => (models_ui.envDraft = e.value)}
									onsubmit={() => useEnvVar(p.id)}
								/>
								<Button label="Use variable" testId={`md-env-use-${p.id}`} onclick={() => useEnvVar(p.id)} />
							</div>
						</div>
						{#if p.custom}
							<Button label={models_ui.refreshing ? 'Fetching…' : 'Fetch models from the endpoint'} testId={`md-refresh-${p.id}`} onclick={() => void refreshEndpoint(p.id)} />
						{/if}
						<div class="box gap-xs">
							<text class="wb-label">Models</text>
							<SearchInput value={models_ui.search} placeholder={`Search ${p.models} models`} oninput={(v) => (models_ui.search = v)} testId={`md-search-${p.id}`} />
							{#each catalog.rows as m (m.id)}
								<div class="row ycenter gap-sm px-sm" testId={`md-model-${p.id}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, '-')}>
									<text class="text-sm text-primary grow min0 truncate">{m.name}</text>
									<Toggle
										checked={isModelKept(p.id, m.id)}
										label="Keep"
										testId={`md-keep-${p.id}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, '-')}
										onchange={(on) => toggleKeep(p.id, m.id, on)}
									/>
								</div>
							{:else}
								<text class="text-sm text-muted px-sm">No models match.</text>
							{/each}
							{#if catalog.total > catalog.rows.length}
								<text class="text-xs text-muted px-sm" testId={`md-more-${p.id}`}>Showing {catalog.rows.length} of {catalog.total}. Type in Search to narrow.</text>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/each}
		{#if filtered.length > providers.length}
			<div class="row ycenter gap-sm px-sm">
				<text class="text-xs text-muted grow" testId="md-providers-count">Showing {providers.length} of {filtered.length}.</text>
				<Button label="Show more" testId="md-providers-more" onclick={() => (models_ui.providerLimit += PROVIDER_PAGE)} />
			</div>
		{/if}
	</div>

	<div class="box gap-xs" testId="md-usage">
		<SectionLabel label="Usage" />
		{#if snap && chat}
			<text class="text-xs text-muted">Current session · {chat.provider}/{chat.modelId}</text>
			{#if snap.provider.hasRun}
				<text class="text-sm text-primary px-sm" testId="md-usage-tokens">In {num(snap.provider.input)} · out {num(snap.provider.output)} · {num(snap.provider.tokens || snap.provider.input + snap.provider.output)} tokens</text>
			{:else}
				<text class="text-sm text-muted px-sm" testId="md-usage-none">No usage recorded in this session yet.</text>
			{/if}
			{#if snap.context}
				<text class="text-sm text-primary px-sm">Context: {num(snap.context.used)} of {num(snap.context.total)} ({pct(snap.context.percent)})</text>
			{/if}
		{:else}
			<text class="text-sm text-muted px-sm" testId="md-usage-nosession">Open a session to see its token usage here.</text>
		{/if}
		<div class="row ycenter gap-sm px-sm">
			<Button label={models_ui.windowsBusy ? 'Checking…' : 'Check window limits'} testId="md-limits" onclick={() => void checkLimits()} />
		</div>
		{#if models_ui.windows}
			{#if models_ui.windows.available}
				{#each models_ui.windows.windows as w, i (i)}
					<text class="text-sm text-primary px-sm" testId={`md-window-${i}`}>
						{w.label}: {w.used !== undefined ? num(w.used) : '—'}{w.limit !== undefined ? ` of ${num(w.limit)}` : ''}{w.remaining !== undefined ? ` · ${num(w.remaining)} left` : ''} {w.unit}
					</text>
				{/each}
				<text class="text-xs text-muted px-sm">Source: {models_ui.windows.source}</text>
			{:else}
				<text class="text-sm text-muted px-sm" testId="md-window-unavailable">Unavailable: {models_ui.windows.reason}</text>
			{/if}
		{:else}
			<text class="text-xs text-muted px-sm">Window limits are shown only where the provider reports them; otherwise this says unavailable.</text>
		{/if}
	</div>
</div>

{#if models_ui.adding}
	<AddProvider onclose={() => { models_ui.adding = false; models_ui.rev++; }} testId="md-add-provider" />
{/if}
