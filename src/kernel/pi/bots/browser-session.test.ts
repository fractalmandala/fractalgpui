import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Harness, MemoryStorage, createRegistry, type ConversationId, type Harness as HarnessType } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createSession, ensureIndex, patchSession } from '../sessions-io.ts';
import { ApprovalsDoc, DEFAULT_EXTENSIONS, installAgentTools, installBotTools } from '../tools.ts';
import { AuditLog } from '../audit.ts';
import { projectEntries } from '../project.ts';
import { botRuntime, closeMemories } from './extension.ts';
import { botPaths } from './paths.ts';
import { createBot } from './store.ts';
import { browserRuntime, closeBrowsers } from './browsers.ts';
import type { PwLoader } from '../browser.ts';

const ctx = () => BACKGROUND_CONTEXT;
const FAUX = { provider: 'faux', modelId: 'faux-1' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = mkdtempSync(join(tmpdir(), 'fractalgpui-botbrowser-'));
afterAll(async () => {
	await closeBrowsers();
	closeMemories();
	rmSync(root, { recursive: true, force: true });
});

const models = createModels();
const faux = fauxProvider();
models.setProvider(faux.provider);

const calls: string[] = [];
/** TEST DOUBLE for Playwright. */
const loader: PwLoader = async () => {
	let url = 'about:blank';
	const page = {
		goto: async (u: string) => void (calls.push(`goto ${u}`), (url = u)),
		url: () => url,
		title: async () => 'Fake',
		screenshot: async (o: { path: string }) => writeFileSync(o.path, Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
		locator: () => ({ ariaSnapshot: async () => '- heading "x"', innerText: async () => 'page text', click: async () => {}, fill: async () => {}, press: async () => {} }),
		getByText: () => ({ first: () => ({ click: async () => {} }) }),
		on: () => {},
		bringToFront: async () => {},
		waitForLoadState: async () => {}
	};
	return { chromium: { launchPersistentContext: async () => ({ pages: () => [page], newPage: async () => page, close: async () => {}, on: () => {} }) } };
};

let harness: HarnessType | null = null;
async function open(): Promise<HarnessType> {
	if (!harness) {
		const registry = createRegistry();
		installAgentTools(registry);
		installBotTools(registry);
		harness = await Harness.open(
			new MemoryStorage(),
			{ models, registry, settings: { extensions: DEFAULT_EXTENSIONS }, env: (t) => new NodeExecutionEnv({ cwd: t.cwd ?? root, shellEnv: process.env }) },
			ctx()
		);
		harness.resume();
		await ensureIndex(harness, () => {}, FAUX);
		botRuntime.harness = harness;
		botRuntime.root = root;
		browserRuntime.root = root;
		browserRuntime.loader = loader;
	}
	return harness;
}

async function botSession(access: 'supervised' | 'full', browser = true) {
	const h = await open();
	const botId = await createBot(h, { name: 'Surfer', capabilities: { browser } }, { root });
	const id = await createSession(h, FAUX, { botId });
	await patchSession(h, id, { access });
	return { h, id, botId };
}
const run = async (h: HarnessType, id: ConversationId, text: string) => (await (await h.conversation(id, ctx()))!.submit({ type: 'input', content: text }, ctx()));
const round = (name: string, args: Record<string, string | number | boolean>, id: string) => fauxAssistantMessage([fauxToolCall(name, args, { id })], { stopReason: 'toolUse' });
const audit = (botId: string) => new AuditLog(botPaths(botId, root).audit).read();
async function pending(h: HarnessType, id: ConversationId, ms = 10000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const s = await h.snapshot(ApprovalsDoc, id, ctx());
		const f = Object.entries(s?.calls ?? {}).find(([, c]) => c.status === 'pending');
		if (f) return f[0];
		await sleep(50);
	}
	return null;
}
async function decide(h: HarnessType, id: ConversationId, callId: string, status: 'approved' | 'denied') {
	await h.commit(async (tx) => {
		const d = await tx.doc(ApprovalsDoc, id);
		if (d.calls[callId]) d.calls[callId].status = status;
	}, ctx());
}
async function transcriptText(h: HarnessType, id: ConversationId) {
	const entries = await (await h.conversation(id, ctx()))!.entries({}, 200, undefined, ctx());
	return JSON.stringify(entries.items) + JSON.stringify(projectEntries(entries.items, undefined));
}

describe('bot browser tools', () => {
	test('only bot sessions have them', async () => {
		const h = await open();
		const plain = await createSession(h, FAUX);
		const names = (await (await h.conversation(plain, ctx()))!.agent(ctx()))!.tools.map((t) => t.name);
		expect(names.some((n) => n.startsWith('browser_'))).toBe(false);
		const { id } = await botSession('full');
		const bn = (await (await h.conversation(id, ctx()))!.agent(ctx()))!.tools.map((t) => t.name);
		for (const t of ['browser_navigate', 'browser_snapshot', 'browser_screenshot', 'browser_click', 'browser_type', 'browser_extract']) expect(bn).toContain(t);
	});

	test('the bot\'s browser capability switch blocks every browser tool and leaves a blocked audit row', async () => {
		const { h, id, botId } = await botSession('full', false);
		faux.setResponses([round('browser_navigate', { url: 'https://example.com' }, 'n0'), fauxAssistantMessage('It was refused, so I stopped here.')]);
		await (await run(h, id, 'Open example.com in your browser please')).wait(ctx());
		expect(calls.some((c) => c.startsWith('goto'))).toBe(false);
		const row = audit(botId).find((r) => r.callId === 'n0');
		expect(row?.phase).toBe('blocked');
		expect(row?.summary).toMatch(/switched off|browser/i);
	});

	test('supervised: navigation asks for approval first; approving runs it, audited before and after', async () => {
		const before = calls.length;
		const { h, id, botId } = await botSession('supervised');
		faux.setResponses([round('browser_navigate', { url: 'https://example.com/a' }, 'n1'), fauxAssistantMessage('Opened the page for you now.')]);
		const turn = await run(h, id, 'Open example.com/a in your browser please');
		const callId = await pending(h, id);
		expect(callId).toBe('n1');
		expect(calls.length).toBe(before); // nothing happened yet
		await decide(h, id, callId!, 'approved');
		await turn.wait(ctx());
		expect(calls.slice(before)).toContain('goto https://example.com/a');
		expect(audit(botId).filter((r) => r.callId === 'n1').map((r) => r.phase)).toEqual(['before', 'approval', 'after']);
	});

	test('supervised: a denied navigation never reaches the browser', async () => {
		const before = calls.length;
		const { h, id } = await botSession('supervised');
		faux.setResponses([round('browser_navigate', { url: 'https://example.com/b' }, 'n2'), fauxAssistantMessage('Understood, I will not open it.')]);
		const turn = await run(h, id, 'Open example.com/b in your browser please');
		await decide(h, id, (await pending(h, id))!, 'denied');
		await turn.wait(ctx());
		expect(calls.length).toBe(before);
	});

	test('reads never ask; a screenshot is a file path in media and no image bytes reach the transcript', async () => {
		const { h, id, botId } = await botSession('supervised');
		faux.setResponses([round('browser_screenshot', {}, 's1'), round('browser_extract', {}, 'e1'), fauxAssistantMessage('Took the screenshot and read the page.')]);
		await (await run(h, id, 'Take a screenshot and read the page text')).wait(ctx());
		const snap = await h.snapshot(ApprovalsDoc, id, ctx());
		expect(Object.keys(snap?.calls ?? {})).toEqual([]);
		const t = await transcriptText(h, id);
		const m = t.match(/Screenshot saved: ([^ ]+\.jpg)/);
		expect(m).toBeTruthy();
		expect(m![1]!.startsWith(botPaths(botId, root).media)).toBe(true);
		expect(existsSync(m![1]!)).toBe(true);
		expect(t).not.toMatch(/base64|data:image|"type":"image"/);
		expect(t).toContain('page text');
	});

	test('a web-only URL policy: file:// is refused with an error result', async () => {
		const before = calls.length;
		const { h, id } = await botSession('full');
		faux.setResponses([round('browser_navigate', { url: 'file:///etc/passwd' }, 'f1'), fauxAssistantMessage('That address cannot be opened here.')]);
		await (await run(h, id, 'Open file:///etc/passwd in your browser please')).wait(ctx());
		expect(calls.length).toBe(before);
		expect(await transcriptText(h, id)).toMatch(/Only http/);
	});
});
