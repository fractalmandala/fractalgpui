import type { AuthInteraction, Credential } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { createModels, type Models, type MutableModels } from '@earendil-works/pi-ai/models';
import { join } from 'node:path';
import { persisted } from '../storage.svelte.ts';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import {
	authSections,
	createCredentialStore,
	createCustomProvider,
	importLegacyKeys,
	envKeyFor,
	keyEnvFor,
	keySource,
	markOwnEnv,
	maskKey,
	type CredentialBag,
	type CustomProviderDef
} from './providers.ts';
import { deleteKeyFile, listKeyFiles, readKeyFile, resolveStored, writeEnvRef, writeKeyFile } from './keyfiles.ts';
import { envIgnored, isKept, keepRef, refOf, splitRef, unkeepRef, detectEnv, type EnvDetected, type KeptState } from './kept.ts';
import { data_dir } from '../paths.ts';

/**
 * Slice 5 kernel: the model catalog, credentials, and provider preferences.
 *
 * The catalog comes from pi-ai's builtins (`builtinModels`), not a hand-written
 * list — every shipped provider (anthropic, openai, google, opencode,
 * opencode-go, …) is present with its models. Credentials live in a
 * `persisted('pi-credentials')` slot behind pi-ai's `CredentialStore`
 * interface (env vars always win at read time; see `providers.ts`), with a
 * one-time import from the legacy plaintext `pi-keys` slot. Enable switches
 * and custom endpoints live in `persisted('pi-providers')`.
 *
 * `PROVIDERS` / `DEFAULT_MODEL` / `saveKey` / `clearKey` / `maskedKey` /
 * `keyStatus` below are the curated-five compatibility surface the current
 * sidebar and session code reads. Slice 7 (Settings surface + model panels)
 * replaces those call sites with catalog reads and deletes the shims.
 */

export interface ProviderDef {
	id: string;
	label: string;
	keyEnv: string;
	keyHint: string;
}

/** The curated providers the pre-Slice-7 sidebar shows. */
export const PROVIDERS: ProviderDef[] = [
	{ id: 'anthropic', label: 'Claude', keyEnv: 'ANTHROPIC_API_KEY', keyHint: 'Set ANTHROPIC_API_KEY in the environment' },
	{ id: 'openai', label: 'OpenAI', keyEnv: 'OPENAI_API_KEY', keyHint: 'Set OPENAI_API_KEY in the environment' },
	{ id: 'google', label: 'Gemini', keyEnv: 'GEMINI_API_KEY', keyHint: 'Set GEMINI_API_KEY in the environment' },
	{ id: 'opencode', label: 'OpenCode', keyEnv: 'OPENCODE_API_KEY', keyHint: 'Set OPENCODE_API_KEY in the environment' },
	{ id: 'opencode-go', label: 'OpenCode Go', keyEnv: 'OPENCODE_API_KEY', keyHint: 'Set OPENCODE_API_KEY in the environment' }
];

/**
 * The model new sessions start on. EMPTY until the user chooses: nothing is preferred silently. Use
 * `resolveDefault()` to read it (it only honours a model that is kept, else the first kept one).
 */
export const modelDefaults = persisted('pi', {
	provider: '',
	modelId: ''
});

/** Headless tests (memory clipboard) run the faux provider: no network, no keys. */
export const isTestEnv = () => process.env.FRACTALGPUI_CLIPBOARD === 'memory';

// --- credential slot ---------------------------------------------------------

interface CredentialEntry {
	providerId: string;
	credential: Credential;
}

const credentialsSlot = persisted<{ entries: CredentialEntry[]; keysMigrated: boolean }>('pi-credentials', {
	entries: [],
	keysMigrated: false
});

/**
 * The store's bag. API keys live as files (`<home>/keys/<provider>.key`, mode 0600, or an `env:NAME` reference);
 * everything else (OAuth sign-ins) stays in the settings slot. Reads merge the two.
 */
export const credentialBag: CredentialBag = {
	readAll: () => {
		const out: Record<string, Credential> = {};
		for (const e of credentialsSlot.entries) if (e.credential.type !== 'api_key') out[e.providerId] = e.credential;
		for (const id of listKeyFiles()) {
			const key = resolveStored(readKeyFile(id));
			if (key) out[id] = { type: 'api_key', key };
		}
		return out;
	},
	writeAll: (next) => {
		const entries: CredentialEntry[] = [];
		const wanted = new Set<string>();
		for (const [providerId, credential] of Object.entries(next)) {
			if (credential.type === 'api_key') {
				wanted.add(providerId);
				const cur = readKeyFile(providerId);
				// an unchanged value (or an env reference that resolves to it) is left alone
				if (credential.key && resolveStored(cur) !== credential.key) writeKeyFile(providerId, credential.key);
			} else entries.push({ providerId, credential });
		}
		for (const id of listKeyFiles()) if (!wanted.has(id)) deleteKeyFile(id);
		credentialsSlot.entries = entries;
	}
};

/** One-time: API keys that older versions kept in settings.json move into key files. */
function migrateKeysToFiles(): void {
	const moved: CredentialEntry[] = [];
	for (const e of credentialsSlot.entries) {
		if (e.credential.type !== 'api_key' || !e.credential.key) continue;
		if (!readKeyFile(e.providerId)) {
			try {
				writeKeyFile(e.providerId, e.credential.key);
			} catch {
				continue;
			}
		}
		moved.push(e);
	}
	if (moved.length) credentialsSlot.entries = credentialsSlot.entries.filter((e) => !moved.includes(e));
}
migrateKeysToFiles();

/** The app's credential store: pi-ai's interface over the slot, env-wins. */
export const credentialStore = createCredentialStore(credentialBag);

const LEGACY_DEFAULTS: Record<string, string> = {
	anthropic: '',
	openai: '',
	google: '',
	opencode: '',
	'opencode-go': ''
};

/** One-time move of the old plaintext `pi-keys` slot into the store. */
function migrateLegacyKeysOnce(): void {
	if (credentialsSlot.keysMigrated) return;
	const legacy = persisted('pi-keys', { ...LEGACY_DEFAULTS });
	importLegacyKeys(credentialBag, legacy);
	credentialsSlot.keysMigrated = true;
}

migrateLegacyKeysOnce();

/** Push stored keys into this process env (never overwrites an exported one). */
export function injectStoredKeys() {
	for (const [id, credential] of Object.entries(credentialBag.readAll())) {
		if (credential?.type !== 'api_key' || !credential.key) continue;
		const env = keyEnvFor(id);
		if (env && !(process.env[env] ?? '').trim()) {
			process.env[env] = credential.key;
			markOwnEnv(env, credential.key);
		}
	}
}

/**
 * Save an API key, synchronously: the sidebar reads the mask back in the same
 * tick, so the write must land atomically (single-threaded read-modify-write
 * through the bag — no await gap). Async flows (OAuth login via
 * `credentialStore.modify`) still serialize through the store's per-provider
 * chain; a login landing after a manual save wins for that provider, which is
 * the explicit-latest-action precedence both paths intend.
 */
export function saveKey(providerId: string, key: string): boolean {
	const clean = key.trim();
	if (!clean) return false;
	const all = credentialBag.readAll();
	all[providerId] = { type: 'api_key', key: clean };
	credentialBag.writeAll(all);
	const env = keyEnvFor(providerId);
	// never overwrite a variable the user exported themselves
	if (env && envKeyFor(providerId) === undefined) {
		process.env[env] = clean;
		markOwnEnv(env, clean);
	}
	return true;
}

export function clearKey(providerId: string) {
	const all = credentialBag.readAll();
	delete all[providerId];
	credentialBag.writeAll(all);
	const env = keyEnvFor(providerId);
	if (env && envKeyFor(providerId) === undefined) {
		delete process.env[env];
		markOwnEnv(env, undefined);
	}
}

/** Point a provider at an environment variable instead of storing a key (the file holds only `env:NAME`). */
export function saveKeyEnvRef(providerId: string, envName: string): void {
	writeEnvRef(providerId, envName);
}

/** The env variable a provider's key file references, if it is a reference. */
export function keyEnvRef(providerId: string): string | undefined {
	const s = readKeyFile(providerId);
	return s?.kind === 'env' ? s.name : undefined;
}

/** Where the key files live (shown in the UI). */
export const keysFolder = () => join(data_dir(), 'keys');

/** Last-4 display for a stored key (`••••abcd`), empty when unset. */
export function maskedKey(providerId: string): string {
	const ref = keyEnvRef(providerId);
	if (ref) return `env:${ref}`;
	const saved = credentialBag.readAll()[providerId];
	return saved?.type === 'api_key' && saved.key ? maskKey(saved.key) : '';
}

// --- provider preferences ----------------------------------------------------

const providerSettings = persisted<{ enabled: Record<string, boolean>; custom: CustomProviderDef[] }>('pi-providers', {
	enabled: {},
	custom: []
});

/** Disabled providers are hidden from the panels, never deleted. Enabled by default. */
export const isProviderEnabled = (providerId: string): boolean => providerSettings.enabled[providerId] !== false;

export function setProviderEnabled(providerId: string, on: boolean) {
	const enabled = { ...providerSettings.enabled };
	if (on) delete enabled[providerId];
	else enabled[providerId] = false;
	providerSettings.enabled = enabled;
}

export const customProviders = (): CustomProviderDef[] => [...providerSettings.custom];

/**
 * Persist a custom endpoint and register it live (no restart). Throws when
 * the id collides with an existing provider.
 */
export function saveCustomProvider(models: Models, def: CustomProviderDef) {
	const mutable = models as MutableModels;
	if (mutable.getProvider(def.id)) throw new Error(`A provider named ${def.id} already exists.`);
	providerSettings.custom = [...providerSettings.custom, def];
	mutable.setProvider(createCustomProvider(def));
}

/**
 * Replace a custom endpoint's stored definition (id may change) and
 * re-register it live. Throws when the new id collides with another provider.
 */
export function updateCustomProvider(models: Models, oldId: string, def: CustomProviderDef) {
	const mutable = models as MutableModels;
	if (def.id !== oldId && mutable.getProvider(def.id)) throw new Error(`A provider named ${def.id} already exists.`);
	providerSettings.custom = [...providerSettings.custom.filter((d) => d.id !== oldId), def];
	try {
		mutable.deleteProvider(oldId);
	} catch {
		// Already gone: re-registering is still correct.
	}
	mutable.setProvider(createCustomProvider(def));
}

export function removeCustomProvider(models: Models, id: string) {
	providerSettings.custom = providerSettings.custom.filter((d) => d.id !== id);
	(models as MutableModels).deleteProvider(id);
	void credentialStore.delete(id).catch(() => {});
}

// --- catalog -----------------------------------------------------------------

/** Shared faux instance in test env, so tests can script its answers. */
const faux = isTestEnv() ? fauxProvider() : null;

/** Script the faux model's next answer (tests). */
export function scriptFauxReply(text: string) {
	faux?.setResponses([fauxAssistantMessage(text)]);
}

/** Script full faux turns, including tool calls (tests). */
export function scriptFauxResponses(responses: import('@earendil-works/pi-ai').AssistantMessage[]) {
	faux?.setResponses(responses);
}

export function buildModels(): Models {
	if (faux) {
		const models = createModels();
		models.setProvider(faux.provider);
		return models;
	}
	const models = builtinModels({ credentials: credentialStore });
	for (const def of providerSettings.custom) {
		try {
			if (!models.getProvider(def.id)) models.setProvider(createCustomProvider(def));
		} catch (err) {
			console.warn(`[fractalgpui] custom provider ${def.id} failed to load: ${(err as Error).message}`);
		}
	}
	return models;
}

/** Which Add-provider sections a provider belongs in — from its own auth. */
export function providerSections(models: Models, providerId: string): ('keys' | 'subscriptions')[] {
	const provider = models.getProvider(providerId);
	return provider ? authSections(provider.auth) : [];
}

/** Run a provider-owned subscription (OAuth) login flow; the credential lands in the store. */
export function loginSubscription(models: Models, providerId: string, interaction: AuthInteraction): Promise<Credential> {
	return models.login(providerId, 'oauth', interaction);
}

export function keyStatus(providerId: string): { ok: boolean; hint: string } {
	if (isTestEnv()) return { ok: true, hint: 'faux provider (tests)' };
	if (!providerId) return { ok: false, hint: 'No model chosen yet. Keep a model in Models & providers, then pick it in the composer.' };
	const source = keySource(credentialBag, providerId);
	if (source.kind === 'env') return { ok: true, hint: `${source.env} connected` };
	if (source.kind === 'stored') return { ok: true, hint: `${source.masked} in this app` };
	if (source.kind === 'oauth') return { ok: true, hint: 'subscription sign-in' };
	const def = PROVIDERS.find((p) => p.id === providerId);
	if (def) return { ok: false, hint: def.keyHint };
	return { ok: false, hint: source.env ? `Set ${source.env} in the environment` : `Unknown provider ${providerId}` };
}


// --- kept models and env-detected providers ----------------------------------------

const keptSlot = persisted<{ kept: string[]; ignoredEnv: Record<string, boolean> }>('pi-kept', { kept: [] as string[], ignoredEnv: {} as Record<string, boolean> });
export const keptState = (): KeptState => keptSlot;

export const isModelKept = (provider: string, modelId: string) => isKept(keptSlot, provider, modelId);
export const keepModel = (provider: string, modelId: string) => void (keptSlot.kept = keepRef(keptSlot, provider, modelId));
export const unkeepModel = (provider: string, modelId: string) => void (keptSlot.kept = unkeepRef(keptSlot, provider, modelId));
export const keptCount = () => keptSlot.kept.length;

export const isEnvIgnored = (providerId: string): boolean => keptSlot.ignoredEnv[providerId] === true;
export function setEnvIgnored(providerId: string, ignored: boolean) {
	const next = { ...keptSlot.ignoredEnv };
	if (ignored) next[providerId] = true;
	else delete next[providerId];
	keptSlot.ignoredEnv = next;
}

/** True when the provider's only key is the (ignored) environment one: its models are not pickable. */
const providerIgnored = (providerId: string) => envIgnored(keptSlot, providerId, credentialBag.readAll()[providerId]?.type === 'api_key');

export interface KeptModel {
	provider: string;
	providerName: string;
	id: string;
	name: string;
	contextWindow: number | null;
	images: boolean;
	reasoning: boolean;
	/** The key is missing, or the provider is ignored/disabled. */
	unavailable: string | null;
}

/**
 * The models the pickers offer: exactly the kept ones, in the order kept, that still exist in the catalog.
 * (Headless tests run only the faux provider, whose models count as kept.)
 */
export function keptModels(models: Models): KeptModel[] {
	const out: KeptModel[] = [];
	const refs: { provider: string; modelId: string }[] = isTestEnv()
		? models.getProviders().flatMap((p) => models.getModels(p.id).map((m) => ({ provider: p.id, modelId: m.id })))
		: keptSlot.kept.map(splitRef).filter((r): r is { provider: string; modelId: string } => !!r);
	for (const r of refs) {
		const p = models.getProvider(r.provider);
		if (!p) continue;
		let m: { id: string; name?: string; contextWindow?: number; input?: readonly string[]; reasoning?: boolean } | undefined;
		try {
			m = (models.getModels(r.provider) as unknown as { id: string; name?: string; contextWindow?: number; input?: readonly string[]; reasoning?: boolean }[]).find((x) => x.id === r.modelId);
		} catch {
			m = undefined;
		}
		if (!m) continue;
		const unavailable = !isProviderEnabled(r.provider) ? 'provider is turned off' : providerIgnored(r.provider) ? 'its env key is ignored' : !keyStatus(r.provider).ok ? 'no key' : null;
		if (!isTestEnv() && (!isProviderEnabled(r.provider) || providerIgnored(r.provider))) continue;
		out.push({
			provider: r.provider,
			providerName: p.name ?? r.provider,
			id: m.id,
			name: m.name ?? m.id,
			contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : null,
			images: m.input?.includes('image') ?? false,
			reasoning: m.reasoning ?? false,
			unavailable
		});
	}
	return out;
}

/** The model for a new session: the saved default if it is kept, else the first kept one, else nothing (empty strings). */
export function resolveDefault(models: Models): { provider: string; modelId: string } {
	const list = keptModels(models);
	const saved = list.find((m) => m.provider === modelDefaults.provider && m.id === modelDefaults.modelId);
	const pick = saved ?? list[0];
	return pick ? { provider: pick.provider, modelId: pick.id } : { provider: '', modelId: '' };
}

/** The first kept model of a provider (used when switching provider), or undefined. */
export const firstKeptOf = (models: Models, providerId: string): string | undefined => keptModels(models).find((m) => m.provider === providerId)?.id;

/** Providers detected from the environment (documented key variable set by the user), each with its ignore state. */
export function envDetectedProviders(models: Models): EnvDetected[] {
	return detectEnv(keptSlot, models.getProviders().map((p) => ({ id: p.id, name: p.name ?? p.id })));
}

export { refOf };
