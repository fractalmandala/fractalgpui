import type {
	AuthOperationOptions,
	Credential,
	CredentialInfo,
	CredentialStore,
	ProviderAuth
} from '@earendil-works/pi-ai';
import { createProvider } from '@earendil-works/pi-ai/models';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';

/**
 * Slice 5 kernel: provider credentials, custom endpoints, and the key-source
 * rules. Plain TypeScript with no UI framework, so `bun test` drives it.
 * `models.ts` binds these to the persisted slots and the live catalog.
 */

// --- credential store -------------------------------------------------------

/** Synchronous JSON record behind the store; `models.ts` binds the slot. */
export interface CredentialBag {
	readAll(): Record<string, Credential>;
	writeAll(next: Record<string, Credential>): void;
}

/** Well-known API-key environment variables, per provider id. */
const KEY_ENV: Record<string, string> = {
	anthropic: 'ANTHROPIC_API_KEY',
	openai: 'OPENAI_API_KEY',
	google: 'GEMINI_API_KEY',
	opencode: 'OPENCODE_API_KEY',
	'opencode-go': 'OPENCODE_API_KEY',
	deepseek: 'DEEPSEEK_API_KEY',
	xai: 'XAI_API_KEY',
	groq: 'GROQ_API_KEY',
	mistral: 'MISTRAL_API_KEY',
	openrouter: 'OPENROUTER_API_KEY',
	together: 'TOGETHER_API_KEY',
	fireworks: 'FIREWORKS_API_KEY',
	moonshotai: 'MOONSHOT_API_KEY',
	cerebras: 'CEREBRAS_API_KEY',
	nvidia: 'NVIDIA_API_KEY'
};

/** The documented variable for a provider, or null when it has none. */
export const keyEnvFor = (providerId: string): string | null => KEY_ENV[providerId] ?? null;

/**
 * Variables this app set itself from a stored key (so the runtime sees the key). They must not be mistaken for a
 * key the user exported: `envKeyFor` treats a variable still holding exactly our value as "not from the environment".
 */
const ownEnv = new Map<string, string>();
export const markOwnEnv = (name: string, value: string | undefined) => (value === undefined ? ownEnv.delete(name) : void ownEnv.set(name, value));

/**
 * Variables never used as a key (ported from pibots env-policy): ANTHROPIC_AUTH_TOKEN is a bearer token for an
 * Anthropic-compatible PROXY; sending it to api.anthropic.com would hand it to a host it was not issued for.
 */
export const BLOCKED_ENV: ReadonlySet<string> = new Set(['ANTHROPIC_AUTH_TOKEN']);

/** The variable when it currently holds a key the USER put there, else undefined. */
export function envKeyFor(providerId: string): string | undefined {
	const name = keyEnvFor(providerId);
	if (!name || BLOCKED_ENV.has(name)) return undefined;
	const v = (process.env[name] ?? '').trim();
	if (!v) return undefined;
	return ownEnv.get(name) === v ? undefined : name;
}

export const maskKey = (key: string): string => `••••${key.slice(-4)}`;

/**
 * Key prefixes the app can verify (§7.7). Only providers with a documented,
 * stable prefix are listed — anything else accepts any non-empty key.
 */
const KEY_PREFIXES: Record<string, string> = {
	anthropic: 'sk-ant-',
	openai: 'sk-',
	google: 'AIza'
};

/** Null when the key looks right; otherwise the reason it is refused. */
export function keyProblem(providerId: string, key: string): string | null {
	const clean = key.trim();
	if (!clean) return 'Paste a key first.';
	const prefix = KEY_PREFIXES[providerId];
	if (prefix && !clean.startsWith(prefix)) return `That doesn't look like a ${providerId} key (it should start with ${prefix}).`;
	return null;
}

export type KeySource =
	| { kind: 'env'; env: string }
	| { kind: 'stored'; masked: string }
	| { kind: 'oauth' }
	| { kind: 'none'; env: string | null };

/** Where a provider's credential comes from: env wins, then the store. */
export function keySource(bag: CredentialBag, providerId: string): KeySource {
	const env = envKeyFor(providerId);
	if (env) return { kind: 'env', env };
	const saved = bag.readAll()[providerId];
	if (saved?.type === 'api_key' && saved.key) return { kind: 'stored', masked: maskKey(saved.key) };
	if (saved?.type === 'oauth') return { kind: 'oauth' };
	return { kind: 'none', env: keyEnvFor(providerId) };
}

/**
 * The app's credential store: pi-ai's interface over the settings slot, with
 * one rule the runtime does not have — an exported env var always wins, so
 * `read` behaves as if nothing were stored while one is set. Writes still land
 * (dormant until the variable is unset); `modify` always sees the real stored
 * value so OAuth refresh flows keep working. Writes serialize per provider.
 */
export function createCredentialStore(bag: CredentialBag): CredentialStore {
	const chains = new Map<string, Promise<unknown>>();
	const serial = <T>(id: string, fn: () => Promise<T>): Promise<T> => {
		const prev = chains.get(id) ?? Promise.resolve();
		const next = prev.then(fn, fn);
		chains.set(id, next.catch(() => {}));
		return next;
	};
	return {
		read: async (providerId: string) => {
			if (envKeyFor(providerId)) return undefined;
			return bag.readAll()[providerId];
		},
		list: async (): Promise<readonly CredentialInfo[]> =>
			Object.entries(bag.readAll()).map(([providerId, credential]) => ({ providerId, type: credential.type })),
		modify: (providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>) =>
			serial(providerId, async () => {
				const all = { ...bag.readAll() };
				const next = await fn(all[providerId]);
				if (next !== undefined) {
					all[providerId] = next;
					bag.writeAll(all);
				}
				return all[providerId];
			}),
		delete: (providerId: string) =>
			serial(providerId, async () => {
				const all = { ...bag.readAll() };
				delete all[providerId];
				bag.writeAll(all);
			})
	};
}

/** Move plaintext legacy keys into the store; returns the ids that moved. */
export function importLegacyKeys(bag: CredentialBag, legacy: Record<string, string>): string[] {
	const all = { ...bag.readAll() };
	const moved: string[] = [];
	for (const [id, key] of Object.entries(legacy)) {
		if (key.trim() && !all[id]) {
			all[id] = { type: 'api_key', key: key.trim() };
			moved.push(id);
		}
	}
	if (moved.length) bag.writeAll(all);
	return moved;
}

/** Which Add-provider sections a provider belongs in — from its own auth, never a list. */
export function authSections(auth: ProviderAuth): ('keys' | 'subscriptions')[] {
	const sections: ('keys' | 'subscriptions')[] = [];
	if (auth?.apiKey) sections.push('keys');
	if (auth?.oauth) sections.push('subscriptions');
	return sections;
}

// --- custom endpoints ---------------------------------------------------------

export type CustomApiFormat = 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai';

export interface CustomProviderDef {
	id: string;
	name: string;
	baseUrl: string;
	api: CustomApiFormat;
	modelIds: string[];
}

const API_FACTORIES = {
	'openai-completions': openAICompletionsApi,
	'openai-responses': openAIResponsesApi,
	'anthropic-messages': anthropicMessagesApi,
	'google-generative-ai': googleGenerativeAIApi
} as const;

export const CUSTOM_API_FORMATS: { id: CustomApiFormat; label: string }[] = [
	{ id: 'openai-completions', label: 'OpenAI Chat Completions' },
	{ id: 'openai-responses', label: 'OpenAI Responses' },
	{ id: 'anthropic-messages', label: 'Anthropic Messages' },
	{ id: 'google-generative-ai', label: 'Google Generative AI' }
];

/** A stored custom endpoint as a live provider. Keys resolve from the credential store. */
export function createCustomProvider(def: CustomProviderDef) {
	return createProvider({
		id: def.id,
		name: def.name,
		baseUrl: def.baseUrl.replace(/\/+$/, ''),
		auth: {
			apiKey: {
				name: `${def.name} API key`,
				resolve: async ({ credential }) =>
					credential?.type === 'api_key' && credential.key
						? { auth: { apiKey: credential.key }, source: 'stored in this app' }
						: undefined
			}
		},
		models: def.modelIds.map((id) => ({
			id,
			name: id,
			api: def.api,
			provider: def.id,
			baseUrl: def.baseUrl,
			input: ['text' as const],
			// An endpoint's list endpoint reports ids only, so limits are unknown.
			// These working defaults keep generation and the usage readout
			// functioning; zeros would break both (maxTokens 0 answers nothing).
			reasoning: false,
			contextWindow: 200000,
			maxTokens: 8192,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
		})),
		api: API_FACTORIES[def.api]()
	});
}

/**
 * List an endpoint's models (OpenAI `/models` shape). Errors report the
 * endpoint's own answer verbatim; anything else explains what was wrong.
 */
export async function fetchEndpointModels(baseUrl: string, apiKey: string): Promise<string[]> {
	const url = `${baseUrl.replace(/\/+$/, '')}/models`;
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(15000)
		});
	} catch (err) {
		throw new Error(`Could not reach the endpoint: ${(err as Error).message}`);
	}
	if (!res.ok) {
		const body = (await res.text()).slice(0, 500);
		throw new Error(`The endpoint answered ${res.status}${body ? `: ${body}` : ''}`);
	}
	let json: unknown;
	try {
		json = await res.json();
	} catch {
		throw new Error('The endpoint did not return JSON.');
	}
	const data = (json as { data?: unknown }).data;
	if (!Array.isArray(data)) throw new Error('The endpoint did not return a model list.');
	const ids = data.map((m) => (m as { id?: unknown }).id).filter((id): id is string => typeof id === 'string' && !!id);
	if (!ids.length) throw new Error('The endpoint returned no models.');
	return ids;
}
