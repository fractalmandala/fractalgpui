import { describe, expect, test } from 'bun:test';
import type { Credential } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import {
	authSections,
	createCredentialStore,
	createCustomProvider,
	fetchEndpointModels,
	importLegacyKeys,
	keyEnvFor,
	keyProblem,
	keySource,
	maskKey,
	type CredentialBag
} from './providers.ts';

const bag = (records: Record<string, Credential> = {}): CredentialBag => {
	let current = { ...records };
	return {
		readAll: () => ({ ...current }),
		writeAll: (next) => {
			current = { ...next };
		}
	};
};

/** Run with an env var set, restoring it afterwards (no afterEach in this repo's bun types). */
	async function withEnv(name: string, value: string, fn: () => Promise<void>): Promise<void> {
		const prev = process.env[name];
		process.env[name] = value;
		try {
			await fn();
		} finally {
			if (prev === undefined) delete process.env[name];
			else process.env[name] = prev;
		}
	}
/** Typed access to the Bun runtime (this repo's tsc types are node-only). */
interface TestServer { port: number; stop(): void }
function serve(opts: { port: number; fetch: (req: Request) => Response }): TestServer {
	const runtime = (globalThis as { Bun?: { serve(o: unknown): TestServer } }).Bun;
	if (!runtime) throw new Error('Bun runtime required');
	return runtime.serve(opts);
	}

	describe('credential store', () => {
		test('write, read, list, delete round-trip', async () => {
			const store = createCredentialStore(bag());
		expect(await store.read('anthropic')).toBeUndefined();
		await store.modify('anthropic', async () => ({ type: 'api_key', key: 'sk-test' }));
		expect(await store.read('anthropic')).toEqual({ type: 'api_key', key: 'sk-test' });
		expect(await store.list()).toEqual([{ providerId: 'anthropic', type: 'api_key' }]);
		await store.delete('anthropic');
		expect(await store.read('anthropic')).toBeUndefined();
	});

	test('an exported env var wins: reads behave unstored', async () => {
		const store = createCredentialStore(bag({ anthropic: { type: 'api_key', key: 'sk-stored' } }));
		await withEnv('ANTHROPIC_API_KEY', 'sk-env-live', async () => {
			expect(await store.read('anthropic')).toBeUndefined();
			expect(keySource({ readAll: () => ({ anthropic: { type: 'api_key', key: 'sk-stored' } }), writeAll: () => {} }, 'anthropic')).toEqual({
				kind: 'env',
				env: 'ANTHROPIC_API_KEY'
			});
		});
	});

	test('modify sees the real stored value even while env wins', async () => {
		const store = createCredentialStore(bag({ anthropic: { type: 'api_key', key: 'sk-stored' } }));
		await withEnv('ANTHROPIC_API_KEY', 'sk-env-live', async () => {
			const seen: (Credential | undefined)[] = [];
			await store.modify('anthropic', async (current) => {
				seen.push(current);
				return current;
			});
			expect(seen).toEqual([{ type: 'api_key', key: 'sk-stored' }]);
		});
	});

	test('writes serialize per provider', async () => {
		const store = createCredentialStore(bag());
		await Promise.all([
			store.modify('x', async () => ({ type: 'api_key', key: 'first' })),
			store.modify('x', async () => ({ type: 'api_key', key: 'second' }))
		]);
		expect(await store.read('x')).toEqual({ type: 'api_key', key: 'second' });
	});
});

describe('keySource', () => {
	test('stored, oauth, and missing states', () => {
		const empty = bag();
		expect(keySource(empty, 'anthropic')).toEqual({ kind: 'none', env: 'ANTHROPIC_API_KEY' });
		expect(keySource(empty, 'some-unknown-thing')).toEqual({ kind: 'none', env: null });
		const stored = bag({ openai: { type: 'api_key', key: 'sk-openai-abcd1234' } });
		expect(keySource(stored, 'openai')).toEqual({ kind: 'stored', masked: maskKey('sk-openai-abcd1234') });
		const oauth = bag({ gh: { type: 'oauth', refresh: 'r', access: 'a', expires: 1 } });
		expect(keySource(oauth, 'gh')).toEqual({ kind: 'oauth' });
	});

	test('mask shows the tail only', () => {
		expect(maskKey('sk-ant-test-1234')).toBe('••••1234');
		expect(keyEnvFor('anthropic')).toBe('ANTHROPIC_API_KEY');
		expect(keyEnvFor('unknown-thing')).toBeNull();
	});
});

describe('keyProblem', () => {
	test('known prefixes are enforced, unknown providers take any key', () => {
		expect(keyProblem('anthropic', 'sk-ant-1234')).toBeNull();
		expect(keyProblem('anthropic', 'sk-1234')).toMatch('sk-ant-');
		expect(keyProblem('openai', 'sk-1234')).toBeNull();
		expect(keyProblem('google', 'AIza1234')).toBeNull();
		expect(keyProblem('google', 'sk-1234')).toMatch('AIza');
		expect(keyProblem('opencode', 'anything')).toBeNull();
		expect(keyProblem('opencode', '  ')).toBe('Paste a key first.');
	});
});

describe('importLegacyKeys', () => {
	test('moves non-empty keys without overwriting', () => {
		let current: Record<string, Credential> = { anthropic: { type: 'api_key', key: 'sk-keep' } };
		const b: CredentialBag = { readAll: () => ({ ...current }), writeAll: (next) => (current = { ...next }) };
		expect(importLegacyKeys(b, { anthropic: 'sk-old', openai: 'sk-new', empty: '  ' })).toEqual(['openai']);
		expect(current['openai']).toEqual({ type: 'api_key', key: 'sk-new' });
		expect(current['anthropic']).toEqual({ type: 'api_key', key: 'sk-keep' });
	});
});

describe('authSections', () => {
	test('membership comes from the provider auth, never a list', () => {
		expect(authSections({ apiKey: { name: 'k' } } as never)).toEqual(['keys']);
		expect(authSections({ oauth: { name: 'o' } } as never)).toEqual(['subscriptions']);
		expect(authSections({ apiKey: { name: 'k' }, oauth: { name: 'o' } } as never)).toEqual(['keys', 'subscriptions']);
		expect(authSections({} as never)).toEqual([]);
	});
});

describe('custom providers', () => {
	test('a definition builds, registers, and lists its models', () => {
		const provider = createCustomProvider({
			id: 'custom-acme',
			name: 'Acme',
			baseUrl: 'https://acme.example.com/v1/',
			api: 'openai-completions',
			modelIds: ['acme-1', 'acme-2']
		});
		expect(provider.id).toBe('custom-acme');
		expect(provider.baseUrl).toBe('https://acme.example.com/v1');
		const models = createModels();
		models.setProvider(provider);
		expect(models.getProvider('custom-acme')?.name).toBe('Acme');
		expect(models.getModels('custom-acme').map((m) => m.id)).toEqual(['acme-1', 'acme-2']);
	});
});
	describe('fetchEndpointModels', () => {
		test('lists ids from an OpenAI-shaped endpoint and reports failures verbatim', async () => {
			const good = serve({
			port: 0,
			fetch: (req) =>
				new URL(req.url).pathname === '/models'
					? Response.json({ data: [{ id: 'stub-a' }, { id: 'stub-b' }, { id: 42 }] })
					: new Response('nope', { status: 404 })
		});
		try {
			const base = `http://127.0.0.1:${good.port}`;
			expect(await fetchEndpointModels(base, 'k')).toEqual(['stub-a', 'stub-b']);
			await expect(fetchEndpointModels(`${base}/missing`, 'k')).rejects.toThrow('404');
		} finally {
			good.stop();
		}
		const bad = serve({ port: 0, fetch: () => new Response('not json', { headers: { 'content-type': 'text/plain' } }) });
		try {
			await expect(fetchEndpointModels(`http://127.0.0.1:${bad.port}`, 'k')).rejects.toThrow('did not return JSON');
		} finally {
			bad.stop();
		}
		await expect(fetchEndpointModels('http://127.0.0.1:1', 'k')).rejects.toThrow('Could not reach');
	});
});
