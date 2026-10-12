import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteKeyFile, keysDir, listKeyFiles, readKeyFile, resolveStored, writeEnvRef, writeKeyFile } from './keyfiles.ts';
import { detectEnv, envIgnored, isKept, keepRef, splitRef, unkeepRef, type KeptState } from './kept.ts';
import { envKeyFor, markOwnEnv } from './providers.ts';
import { fetchWindows, openRouterWindows, windowsFromHeaders } from './windows.ts';

const root = mkdtempSync(join(tmpdir(), 'fractalgpui-keys-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const saved = { ...process.env };
const reset = () => {
	for (const k of ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'MY_KEY']) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
	markOwnEnv('OPENAI_API_KEY', undefined);
};
afterAll(reset);

describe('key files', () => {
	test('stored at <home>/keys/<provider>.key with mode 0600 (folder 0700)', () => {
		writeKeyFile('opencode', '  sk-test-abcd ', root);
		const f = join(keysDir(root), 'opencode.key');
		expect(readFileSync(f, 'utf8').trim()).toBe('sk-test-abcd');
		expect((statSync(f).mode & 0o777).toString(8)).toBe('600');
		expect((statSync(keysDir(root)).mode & 0o777).toString(8)).toBe('700');
		expect(listKeyFiles(root)).toContain('opencode');
		writeKeyFile('opencode', 'sk-test-new', root); // rewrite keeps 0600
		expect((statSync(f).mode & 0o777).toString(8)).toBe('600');
		deleteKeyFile('opencode', root);
		expect(existsSync(f)).toBe(false);
	});
	test('env reference: nothing copied; resolves against the environment', () => {
		writeEnvRef('openai', 'MY_KEY', root);
		const s = readKeyFile('openai', root);
		expect(s).toEqual({ kind: 'env', name: 'MY_KEY' });
		expect(resolveStored(s, {})).toBeUndefined();
		expect(resolveStored(s, { MY_KEY: 'sk-live' })).toBe('sk-live');
		expect(readFileSync(join(keysDir(root), 'openai.key'), 'utf8')).not.toContain('sk-live');
	});
	test('bad input is refused (traversal, empty, multiline, env: prefix, bad var name)', () => {
		expect(() => writeKeyFile('../evil', 'k', root)).toThrow();
		expect(() => writeKeyFile('a', '   ', root)).toThrow(/Paste/);
		expect(() => writeKeyFile('a', 'x\ny', root)).toThrow(/single line/);
		expect(() => writeKeyFile('a', 'env:FOO', root)).toThrow();
		expect(() => writeEnvRef('a', 'not valid', root)).toThrow(/valid environment/);
		expect(readKeyFile('../evil', root)).toBeUndefined();
	});
});

describe('kept models', () => {
	const empty = (): KeptState => ({ kept: [], ignoredEnv: {} });
	test('nothing is kept by default; keeping is explicit, idempotent and reversible', () => {
		const s = empty();
		expect(isKept(s, 'opencode', 'm1')).toBe(false);
		s.kept = keepRef(s, 'opencode', 'm1');
		s.kept = keepRef(s, 'opencode', 'm1');
		expect(s.kept).toEqual(['opencode/m1']);
		expect(isKept(s, 'opencode', 'm1')).toBe(true);
		s.kept = unkeepRef(s, 'opencode', 'm1');
		expect(s.kept).toEqual([]);
	});
	test('refs split on the first slash (model ids may contain slashes)', () => {
		expect(splitRef('openrouter/meta/llama-3')).toEqual({ provider: 'openrouter', modelId: 'meta/llama-3' });
		expect(splitRef('nope')).toBeNull();
	});
});

describe('env-detected providers', () => {
	const provs = [{ id: 'opencode', name: 'OpenCode' }, { id: 'openai', name: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic' }];
	test('listed as detected with their variable; not preferred, contributing no kept models', () => {
		reset();
		process.env.OPENCODE_API_KEY = 'oc-123';
		delete process.env.OPENAI_API_KEY;
		const s: KeptState = { kept: [], ignoredEnv: {} };
		const d = detectEnv(s, provs);
		expect(d.map((x) => x.providerId)).toEqual(['opencode']);
		expect(d[0]).toMatchObject({ env: 'OPENCODE_API_KEY', ignored: false, keptCount: 0 });
		expect(s.kept).toEqual([]);
	});
	test('a variable this app set from a stored key is NOT reported as detected from env', () => {
		reset();
		process.env.OPENAI_API_KEY = 'sk-from-file';
		markOwnEnv('OPENAI_API_KEY', 'sk-from-file');
		expect(envKeyFor('openai')).toBeUndefined();
		process.env.OPENAI_API_KEY = 'sk-user-exported'; // changed by the user: now theirs
		expect(envKeyFor('openai')).toBe('OPENAI_API_KEY');
	});
	test('ignore: env-only provider is ignored; a stored key overrides the ignore', () => {
		reset();
		process.env.OPENCODE_API_KEY = 'oc-123';
		const s: KeptState = { kept: [], ignoredEnv: { opencode: true } };
		expect(detectEnv(s, provs)[0]!.ignored).toBe(true);
		expect(envIgnored(s, 'opencode', false)).toBe(true);
		expect(envIgnored(s, 'opencode', true)).toBe(false);
		expect(envIgnored({ kept: [], ignoredEnv: {} }, 'opencode', false)).toBe(false);
	});
	test('OpenCode is a supported provider with OPENCODE_API_KEY', () => {
		reset();
		process.env.OPENCODE_API_KEY = 'oc-123';
		expect(envKeyFor('opencode')).toBe('OPENCODE_API_KEY');
		expect(envKeyFor('opencode-go')).toBe('OPENCODE_API_KEY');
	});
});

describe('usage windows', () => {
	const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
	test('parses anthropic and x-ratelimit headers; absent headers give no windows', () => {
		const w = windowsFromHeaders(hdr({ 'anthropic-ratelimit-requests-limit': '50', 'anthropic-ratelimit-requests-remaining': '49', 'anthropic-ratelimit-requests-reset': '2026-10-12T10:00:00Z', 'x-ratelimit-limit-tokens': '1000', 'x-ratelimit-remaining-tokens': '900' }));
		expect(w.map((x) => x.label)).toEqual(['Requests', 'Tokens']);
		expect(w[0]).toMatchObject({ limit: 50, remaining: 49, resetsAt: Date.parse('2026-10-12T10:00:00Z') });
		expect(windowsFromHeaders(hdr({}))).toEqual([]);
	});
	test('OpenRouter key endpoint is read; errors say why', async () => {
		const ok = (async () => new Response(JSON.stringify({ data: { limit: 10, usage: 2.5, limit_remaining: 7.5, usage_daily: 1 } }))) as unknown as typeof fetch;
		const r = await openRouterWindows('k', ok);
		expect(r.available && r.windows[0]).toMatchObject({ label: 'Credit', used: 2.5, limit: 10, remaining: 7.5 });
		const bad = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch;
		const e = await openRouterWindows('k', bad);
		expect(!e.available && e.reason).toMatch(/401/);
	});
	test('providers with no readable limits say unavailable (never estimated)', async () => {
		const r = await fetchWindows('anthropic', 'k');
		expect(r.available).toBe(false);
		expect(!r.available && r.reason).toMatch(/does not expose/);
		const none = await fetchWindows('openrouter', undefined);
		expect(none.available).toBe(false);
	});
});
