import type { AuthInteraction, Credential } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { createModels, type Models, type MutableModels } from '@earendil-works/pi-ai/models';
import { persisted } from '../storage.svelte.ts';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import {
	authSections,
	createCredentialStore,
	createCustomProvider,
	importLegacyKeys,
	keyEnvFor,
	keySource,
	maskKey,
	type CredentialBag,
	type CustomProviderDef
} from './providers.ts';

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

export const DEFAULT_MODEL: Record<string, string> = {
	anthropic: 'claude-sonnet-4-6',
	openai: 'gpt-4o',
	google: 'gemini-2.5-flash',
	opencode: 'gemini-2.5-flash',
	'opencode-go': 'deepseek-v4.1-flash'
};

/**
 * The default model for new sessions (TECH Slice 2: the old `persisted('pi')`
 * slot in session.svelte.ts moved here). A session's own model lives in its
 * `SessionMeta` and is applied with `configure({model})`.
 */
export const modelDefaults = persisted('pi', {
	provider: 'anthropic',
	modelId: DEFAULT_MODEL['anthropic']
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

/** The store's bag: a free-form id → credential map over the slot's entries. */
export const credentialBag: CredentialBag = {
	readAll: () => Object.fromEntries(credentialsSlot.entries.map((e) => [e.providerId, e.credential])),
	writeAll: (next) => {
		credentialsSlot.entries = Object.entries(next).map(([providerId, credential]) => ({ providerId, credential }));
	}
};

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
		if (env && !(process.env[env] ?? '').trim()) process.env[env] = credential.key;
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
	if (env) process.env[env] = clean;
	return true;
}

export function clearKey(providerId: string) {
	const all = credentialBag.readAll();
	delete all[providerId];
	credentialBag.writeAll(all);
	const env = keyEnvFor(providerId);
	if (env) delete process.env[env];
}

/** Last-4 display for a stored key (`••••abcd`), empty when unset. */
export function maskedKey(providerId: string): string {
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
	const source = keySource(credentialBag, providerId);
	if (source.kind === 'env') return { ok: true, hint: `${source.env} connected` };
	if (source.kind === 'stored') return { ok: true, hint: `${source.masked} in this app` };
	if (source.kind === 'oauth') return { ok: true, hint: 'subscription sign-in' };
	const def = PROVIDERS.find((p) => p.id === providerId);
	if (def) return { ok: false, hint: def.keyHint };
	return { ok: false, hint: source.env ? `Set ${source.env} in the environment` : `Unknown provider ${providerId}` };
}
