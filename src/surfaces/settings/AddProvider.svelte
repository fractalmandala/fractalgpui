<script lang="ts">
	import Button from '../../ui/Button.svelte';
	import IconButton from '../../ui/IconButton.svelte';
	import Menu from '../../ui/Menu.svelte';
	import Modal from '../../ui/Modal.svelte';
	import SearchInput from '../../ui/SearchInput.svelte';
	import SectionLabel from '../../ui/SectionLabel.svelte';
	import { copy_text } from '../../kernel/clipboard.ts';
	import { flash } from '../../kernel/status.svelte.ts';
	import { openUrl } from '../../kernel/reveal.ts';
	import { piModels } from '../../kernel/pi/harness.svelte.ts';
	import {
		credentialBag,
		loginSubscription,
		maskedKey,
		saveCustomProvider,
		saveKey,
		clearKey,
		updateCustomProvider,
		type CustomProviderDef
	} from '../../kernel/pi/models.ts';
	import {
		authSections,
		CUSTOM_API_FORMATS,
		fetchEndpointModels,
		keyEnvFor,
		keyProblem,
		keySource,
		type CustomApiFormat
	} from '../../kernel/pi/providers.ts';
	import type { AuthPrompt } from '@earendil-works/pi-ai';
	import { runLoginFlow, type LoginUi } from './login.ts';

	// Add AI provider (§7.6–§7.11): filterable key/subscription sections from
	// each provider's own auth, the key form, the custom endpoint form with a
	// fetched model list, and the subscription sign-in flow. No restart needed
	// after Save (§7.10). `editing` pre-fills the custom form (§7.11).
	let {
		editing = null,
		onclose,
		testId = 'set-add-provider'
	}: {
		editing?: CustomProviderDef | null;
		onclose: () => void;
		testId?: string;
	} = $props();

	// Fixed at mount (the parent sets `editing` before opening the modal).
	const initial = editing;
	type Stage = 'list' | 'key' | 'custom' | 'login';
	let stage = $state<Stage>(initial ? 'custom' : 'list');
	let filter = $state('');

	interface CatalogRow {
		id: string;
		name: string;
		host: string;
		sections: ('keys' | 'subscriptions')[];
		loginLabel: string | null;
	}

	function catalog(): CatalogRow[] {
		const out: CatalogRow[] = [];
		for (const p of piModels().getProviders()) {
			const sections = authSections(p.auth);
			if (!sections.length) continue;
			out.push({
				id: p.id,
				name: p.name ?? p.id,
				host: p.baseUrl ?? '',
				sections,
				loginLabel: p.auth.oauth && typeof p.auth.oauth === 'object' ? ((p.auth.oauth.loginLabel as string | undefined) ?? null) : null
			});
		}
		return out;
	}

	const matches = (name: string, host: string) => {
		const q = filter.trim().toLowerCase();
		return !q || name.toLowerCase().includes(q) || host.toLowerCase().includes(q);
	};
	const keyRows = () => catalog().filter((p) => p.sections.includes('keys') && matches(p.name, p.host));
	const subRows = () => catalog().filter((p) => p.sections.includes('subscriptions') && matches(p.name, p.host));

	// --- key form ---
	let keyId = $state('');
	let keyName = $state('');
	let keyEnv = $state<string | null>(null);
	let keyDraft = $state('');
	let keyError = $state<string | null>(null);

	function openKey(id: string, name: string) {
		keyId = id;
		keyName = name;
		keyEnv = keyEnvFor(id);
		keyDraft = '';
		keyError = null;
		stage = 'key';
	}

	function commitKey() {
		keyError = null;
		if (!keyDraft.trim()) {
			if (maskedKey(keyId)) {
				clearKey(keyId);
				flash(`${keyName} key cleared`, 'success');
				onclose();
			} else keyError = 'Paste a key first.';
			return;
		}
		const problem = keyProblem(keyId, keyDraft);
		if (problem) {
			keyError = problem;
			return;
		}
		saveKey(keyId, keyDraft);
		flash(`${keyName} key saved in this app`, 'success');
		onclose();
	}

	// --- custom endpoint form ---
	let customName = $state(initial?.name ?? '');
	let customBase = $state(initial?.baseUrl ?? '');
	let customKey = $state('');
	let customApi = $state<CustomApiFormat>(initial?.api ?? 'openai-completions');
	let apiMenu = $state(false);
	let fetched = $state<string[]>(initial ? [...initial.modelIds] : []);
	let chosen = $state<string[]>(initial ? [...initial.modelIds] : []);
	let searchFetched = $state('');
	let searchAdded = $state('');
	let manualId = $state('');
	let fetching = $state(false);
	let fetchError = $state<string | null>(null);
	let customError = $state<string | null>(null);

	const apiLabel = (id: CustomApiFormat) => CUSTOM_API_FORMATS.find((f) => f.id === id)?.label ?? id;
	const shownFetched = () => {
		const q = searchFetched.trim().toLowerCase();
		return fetched.filter((m) => !q || m.toLowerCase().includes(q));
	};
	const shownChosen = () => {
		const q = searchAdded.trim().toLowerCase();
		return chosen.filter((m) => !q || m.toLowerCase().includes(q));
	};

	async function fetchList() {
		fetching = true;
		fetchError = null;
		try {
			fetched = await fetchEndpointModels(customBase, customKey);
		} catch (err) {
			fetched = [];
			fetchError = (err as Error).message;
		} finally {
			fetching = false;
		}
	}

	function toggleChosen(id: string) {
		chosen = chosen.includes(id) ? chosen.filter((m) => m !== id) : [...chosen, id];
	}

	function commitCustom() {
		customError = null;
		const name = customName.trim();
		if (!name) {
			customError = 'Give the endpoint a name.';
			return;
		}
		let base = customBase.trim();
		if (!base) {
			customError = 'Enter a base URL.';
			return;
		}
		try {
			const url = new URL(base);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
			base = url.toString().replace(/\/+$/, '');
		} catch {
			customError = `Not a valid http(s) URL: ${customBase.trim()}`;
			return;
		}
		if (!chosen.length) {
			customError = 'Choose at least one model.';
			return;
		}
		const def: CustomProviderDef = {
			id: editing?.id ?? `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
			name,
			baseUrl: base,
			api: customApi,
			modelIds: [...chosen]
		};
		try {
			if (editing) updateCustomProvider(piModels(), editing.id, def);
			else saveCustomProvider(piModels(), def);
		} catch (err) {
			customError = (err as Error).message;
			return;
		}
		if (customKey.trim()) saveKey(def.id, customKey);
		flash(`${name} saved — its models are available now`, 'success');
		onclose();
	}

	// --- subscription sign-in ---
	let loginId = $state('');
	let loginName = $state('');
	let loginLabel = $state<string | null>(null);
	let loginNotes = $state<string[]>([]);
	let loginDevice = $state<{ userCode: string; verificationUri: string } | null>(null);
	let loginPrompt = $state<{ p: AuthPrompt; answer: (value: string) => void } | null>(null);
	let promptDraft = $state('');
	let loginError = $state<string | null>(null);
	let loginRunning = $state(false);
	let loginDone = $state(false);
	let started = false;

	function openLogin(id: string, name: string, label: string | null) {
		loginId = id;
		loginName = name;
		loginLabel = label;
		loginNotes = [];
		loginDevice = null;
		loginPrompt = null;
		loginError = null;
		loginRunning = false;
		loginDone = false;
		started = false;
		stage = 'login';
	}

	$effect(() => {
		if (stage === 'login' && !started) {
			started = true;
			void runFlow();
		}
	});

	async function runFlow() {
		loginRunning = true;
		loginError = null;
		const ui: LoginUi = {
			prompt: (p) =>
				new Promise<string>((resolve, reject) => {
					promptDraft = '';
					loginPrompt = {
						p,
						answer: (value: string) => {
							loginPrompt = null;
							resolve(value);
						}
					};
					void reject;
				}),
			note: (t) => (loginNotes = [...loginNotes, t]),
			openUrl: (url) => {
				if (!openUrl(url)) loginNotes = [...loginNotes, `Open this URL: ${url}`];
			},
			device: (d) => (loginDevice = d)
		};
		const result = await runLoginFlow((interaction) => loginSubscription(piModels(), loginId, interaction), ui);
		loginRunning = false;
		if (result.ok) {
			loginDone = true;
			flash(`Signed in to ${loginName}`, 'success');
			onclose();
		} else loginError = result.error;
	}

	function cancelLogin() {
		loginRunning = false;
		onclose();
	}

	const stored = () => (keyId ? keySource(credentialBag, keyId) : { kind: 'none' as const, env: null });
</script>

<Modal title={editing ? `Edit ${editing.name}` : 'Add AI provider'} onclose={onclose} footer={foot} {testId}>
	{#if stage === 'list'}
		<SearchInput value={filter} placeholder="Filter services" oninput={(v) => (filter = v)} testId={`${testId}-filter`} focus />
		<div class="box gap-xs">
			<SectionLabel label="Connect with an API key" />
			{#each keyRows() as p (p.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="wb-row-item row ycenter gap-sm" hitbox="self" testId={`${testId}-key-${p.id}`} onclick={() => openKey(p.id, p.name)}>
					<div class="wb-glyph row xcenter ycenter shrink-0"><text class="text-sm text-secondary">{p.name.slice(0, 1).toUpperCase()}</text></div>
					<div class="box grow min0">
						<text class="text-sm text-primary truncate">{p.name}</text>
						{#if p.host}<text class="text-xs text-muted truncate">{p.host}</text>{/if}
					</div>
				</div>
			{/each}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="wb-row-item row ycenter gap-sm"
				hitbox="self"
				testId={`${testId}-custom`}
				onclick={() => {
					customName = '';
					customBase = '';
					customKey = '';
					fetched = [];
					chosen = [];
					fetchError = null;
					customError = null;
					stage = 'custom';
				}}
			>
				<div class="wb-glyph row xcenter ycenter shrink-0"><text class="text-sm text-secondary">+</text></div>
				<div class="box grow min0">
					<text class="text-sm text-primary">Custom endpoint</text>
					<text class="text-xs text-muted">Any OpenAI-compatible API</text>
				</div>
			</div>
		</div>
		<div class="box gap-xs">
			<SectionLabel label="Sign in with a subscription" />
			{#each subRows() as p (p.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="wb-row-item row ycenter gap-sm" hitbox="self" testId={`${testId}-sub-${p.id}`} onclick={() => openLogin(p.id, p.name, p.loginLabel)}>
					<div class="wb-glyph row xcenter ycenter shrink-0"><text class="text-sm text-secondary">{p.name.slice(0, 1).toUpperCase()}</text></div>
					<div class="box grow min0">
						<text class="text-sm text-primary truncate">{p.name}</text>
						{#if p.loginLabel}<text class="text-xs text-muted truncate">{p.loginLabel}</text>{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else if stage === 'key'}
		<div class="box gap-xs">
			<text class="text-sm text-primary">{keyName}</text>
			<text class="text-xs text-muted">Stored in this app's settings file{keyEnv ? `; ${keyEnv} still wins when exported` : ''}.</text>
			{#if stored().kind === 'stored'}<text class="text-xs text-muted">Current: {stored().kind === 'stored' ? (stored() as { masked: string }).masked : ''}</text>{/if}
			<input
				class="input"
				testId={`${testId}-key-input`}
				placeholder={keyEnv ? `Paste ${keyEnv}…` : 'Paste the API key…'}
				value={keyDraft}
				autofocus
				onchange={(e: { value: string }) => (keyDraft = e.value)}
				onsubmit={commitKey}
			/>
			{#if keyError}<text class="text-xs text-danger" testId={`${testId}-key-error`}>{keyError}</text>{/if}
		</div>
	{:else if stage === 'custom'}
		<div class="box gap-xs">
			<div class="box gap-xs">
				<text class="text-xs text-muted">Name</text>
				<input class="input" testId={`${testId}-name`} placeholder="Acme" value={customName} onchange={(e: { value: string }) => (customName = e.value)} />
			</div>
			<div class="box gap-xs">
				<text class="text-xs text-muted">Base URL</text>
				<input
					class="input"
					testId={`${testId}-base`}
					placeholder="https://acme.example.com/v1"
					value={customBase}
					onchange={(e: { value: string }) => (customBase = e.value)}
				/>
			</div>
			<div class="box gap-xs">
				<text class="text-xs text-muted">API key</text>
				<input class="input" testId={`${testId}-key-input`} placeholder="Stored in this app" value={customKey} onchange={(e: { value: string }) => (customKey = e.value)} />
			</div>
			<div class="box gap-xs">
				<text class="text-xs text-muted">API format</text>
				<Button label={apiLabel(customApi)} testId={`${testId}-api`} onclick={() => (apiMenu = !apiMenu)} />
				{#if apiMenu}
					<Menu
						items={CUSTOM_API_FORMATS.map((f) => ({ id: f.id, label: f.label, checked: f.id === customApi }))}
						onselect={(id) => {
							customApi = id as CustomApiFormat;
							apiMenu = false;
						}}
						onclose={() => (apiMenu = false)}
						testId={`${testId}-api-menu`}
					/>
				{/if}
			</div>
			<div class="box gap-xs">
				<div class="row ycenter xbetween gap-sm">
					<SectionLabel label="Models from this service" />
					<Button label={fetching ? 'Fetching…' : 'Fetch list'} testId={`${testId}-fetch`} onclick={fetchList} />
				</div>
				{#if !customBase.trim()}
					<text class="text-sm text-muted">Enter a base URL to load models</text>
				{:else}
					<SearchInput value={searchFetched} placeholder="Search model ID" oninput={(v) => (searchFetched = v)} testId={`${testId}-search`} />
					{#if fetchError}<text class="text-xs text-danger" testId={`${testId}-fetch-error`}>{fetchError}</text>{/if}
					{#each shownFetched() as m (m)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="wb-palette-item row ycenter gap-sm px-sm h-md radius-sm" hitbox="self" testId={`${testId}-fetch-${m}`} onclick={() => toggleChosen(m)}>
							<text class="grow min0 truncate text-sm text-primary">{m}</text>
							{#if chosen.includes(m)}<text class="text-xs text-muted">chosen</text>{/if}
						</div>
					{/each}
				{/if}
			</div>
			<div class="box gap-xs">
				<SectionLabel label="Model settings" />
				<SearchInput value={searchAdded} placeholder="Search added models" oninput={(v) => (searchAdded = v)} testId={`${testId}-added-search`} />
				{#if !chosen.length}
					<text class="text-sm text-muted">No models chosen yet. Pick one from the list.</text>
				{:else}
					{#each shownChosen() as m (m)}
						<div class="row ycenter gap-sm px-sm">
							<text class="grow min0 truncate text-sm text-primary">{m}</text>
							<IconButton icon="x" testId={`${testId}-remove-${m}`} onclick={() => toggleChosen(m)} />
						</div>
					{/each}
				{/if}
				<div class="row ycenter gap-xs">
					<input
						class="input grow min0"
						testId={`${testId}-manual`}
						placeholder="+ Add custom model"
						value={manualId}
						onchange={(e: { value: string }) => (manualId = e.value)}
						onsubmit={() => {
							if (manualId.trim() && !chosen.includes(manualId.trim())) chosen = [...chosen, manualId.trim()];
							manualId = '';
						}}
					/>
					<Button
						label="Add"
						testId={`${testId}-manual-add`}
						onclick={() => {
							if (manualId.trim() && !chosen.includes(manualId.trim())) chosen = [...chosen, manualId.trim()];
							manualId = '';
						}}
					/>
				</div>
			</div>
			{#if customError}<text class="text-xs text-danger" testId={`${testId}-error`}>{customError}</text>{/if}
		</div>
	{:else}
		<div class="box gap-xs">
			<text class="text-sm text-primary">{loginLabel ?? `Sign in to ${loginName}`}</text>
			{#each loginNotes as note (note)}
				<text class="text-sm text-secondary">{note}</text>
			{/each}
			{#if loginDevice}
				<div class="box gap-xs sunken border radius-sm pad-sm">
					<text class="text-md weight-600 text-primary" testId={`${testId}-user-code`}>{loginDevice.userCode}</text>
					<div class="row ycenter gap-xs">
						<text class="text-xs text-muted grow truncate">{loginDevice.verificationUri}</text>
						<IconButton icon="copy" testId={`${testId}-code-copy`} onclick={() => copy_text(loginDevice?.userCode ?? '')} />
					</div>
				</div>
			{/if}
			{#if loginPrompt}
				{#if loginPrompt.p.type === 'select'}
					<Menu
						items={loginPrompt.p.options.map((o) => ({ id: o.id, label: o.label, description: o.description }))}
						onselect={(id) => loginPrompt?.answer(id)}
						onclose={() => {}}
						testId={`${testId}-prompt`}
					/>
				{:else}
					<div class="box gap-xs">
						<text class="text-sm text-secondary">{loginPrompt.p.message}</text>
						<input
							class="input"
							testId={`${testId}-prompt-input`}
							placeholder={loginPrompt.p.placeholder ?? ''}
							value={promptDraft}
							autofocus
							onchange={(e: { value: string }) => (promptDraft = e.value)}
							onsubmit={() => loginPrompt?.answer(promptDraft)}
						/>
						<Button label="Continue" variant="primary" testId={`${testId}-prompt-ok`} onclick={() => loginPrompt?.answer(promptDraft)} />
					</div>
				{/if}
			{/if}
			{#if loginError}<text class="text-xs text-danger" testId={`${testId}-login-error`}>{loginError}</text>{/if}
			{#if loginRunning && !loginPrompt}<text class="text-sm text-muted">Signing in…</text>{/if}
		</div>
	{/if}
	{#snippet foot()}
		{#if stage === 'key'}
			<Button label="Back" variant="ghost" onclick={() => (stage = 'list')} />
			<Button label="Save provider" variant="primary" testId={`${testId}-save`} onclick={commitKey} />
		{:else if stage === 'custom'}
			{#if !editing}<Button label="Back" variant="ghost" onclick={() => (stage = 'list')} />{/if}
			<Button label="Save provider" variant="primary" testId={`${testId}-save`} onclick={commitCustom} />
		{:else if stage === 'login'}
			<Button label="Cancel" variant="ghost" testId={`${testId}-cancel`} onclick={cancelLogin} />
		{:else}
			<Button label="Cancel" variant="ghost" testId={`${testId}-cancel`} onclick={onclose} />
		{/if}
	{/snippet}
</Modal>
