import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Harness, MemoryStorage, createRegistry, type ConversationId, type Harness as HarnessType } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { SessionsDoc } from '../metadata.ts';
import { createSession, ensureIndex, patchSession } from '../sessions-io.ts';
import { ApprovalsDoc, DEFAULT_EXTENSIONS, installAgentTools, installBotTools } from '../tools.ts';
import { AuditLog } from '../audit.ts';
import { MAX_RESULT_CHARS } from '../caps.ts';
import { projectEntries } from '../project.ts';
import { botRuntime, closeMemories, memoryFor } from './extension.ts';
import { BotsDoc } from './meta.ts';
import { botPaths } from './paths.ts';
import { createBot, getBot, updateBot } from './store.ts';

const ctx = () => BACKGROUND_CONTEXT;
const FAUX = { provider: 'faux', modelId: 'faux-1' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = mkdtempSync(join(tmpdir(), 'fractalgpui-botsess-'));
afterAll(() => {
	closeMemories();
	rmSync(root, { recursive: true, force: true });
});

const models = createModels();
const faux = fauxProvider();
models.setProvider(faux.provider);

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
		// TEST DOUBLE for the model summarizer: first words, deterministic.
		botRuntime.summarize = async (r) => (r.kind === 'merge' ? `merged: ${r.text.slice(0, 80)}` : `${r.role}: ${r.text.slice(0, 60)}`);
	}
	return harness;
}

async function botSession(over: { name?: string; access?: 'supervised' | 'edits' | 'full'; capabilities?: Partial<{ shell: boolean; fileWrite: boolean; browser: boolean; agentEditsCharacter: boolean }>; memory?: Record<string, unknown> } = {}) {
	const h = await open();
	const botId = await createBot(h, { name: over.name ?? 'Mira', character: { tone: 'friendly', addressUserAs: 'Amrit' }, capabilities: over.capabilities, memory: over.memory as never }, { root });
	const id = await createSession(h, FAUX, { botId });
	await patchSession(h, id, { access: over.access ?? 'full' });
	return { h, id, botId, bot: (await getBot(h, botId))! };
}

async function run(h: HarnessType, id: ConversationId, text: string) {
	const conv = (await h.conversation(id, ctx()))!;
	return conv.submit({ type: 'input', content: text }, ctx());
}
async function transcript(h: HarnessType, id: ConversationId) {
	const conv = (await h.conversation(id, ctx()))!;
	const entries = await conv.entries({}, 200, undefined, ctx());
	const approvals = await h.snapshot(ApprovalsDoc, id, ctx());
	return projectEntries(entries.items, undefined, approvals ? { 'fractal.approvals': approvals } : undefined);
}
async function pendingCall(h: HarnessType, id: ConversationId, ms = 10000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const snap = await h.snapshot(ApprovalsDoc, id, ctx());
		const f = Object.entries(snap?.calls ?? {}).find(([, c]) => c.status === 'pending');
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
const toolRound = (name: string, args: Record<string, string | number | boolean>, callId: string) => fauxAssistantMessage([fauxToolCall(name, args, { id: callId })], { stopReason: 'toolUse' });
const auditRows = (botId: string) => new AuditLog(botPaths(botId, root).audit).read();
const resultText = (rows: Awaited<ReturnType<typeof transcript>>) => rows.filter((r) => r.kind === 'code').map((r) => (r as { code: string }).code).join('\n');

describe('a session with a bot uses the bot', () => {
	test('system prompt carries identity, character, profile and memory view; plain sessions carry none of it', async () => {
		const { h, id, botId } = await botSession({ name: 'Mira' });
		await updateBot(h, botId, { character: { notes: 'Always sign off with a haiku.' } }, { root });
		const seen: { prompt: string; tools: string[] }[] = [];
		const flat = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));
		const capture = () => (c: { messages: { role: string; content?: unknown; sections?: unknown }[] }) => {
			const sys = c.messages.filter((m) => m.role === 'system').map((m) => `${flat(m.content)}\n${flat(m.sections)}`);
			seen.push({ prompt: sys.join('\n').replace(/\\n/g, '\n').replace(/\\"/g, '"'), tools: [] });
			return fauxAssistantMessage('Noted, all set on my side.');
		};
		// a profile entry set by the user
		await h.commit(async (tx) => {
			const d = await tx.doc(BotsDoc);
			d.bots[botId]!.profile.entries.push({ key: 'city', text: 'lives in Pune', ts: 1, by: 'user' });
		}, ctx());
		faux.setResponses([capture(), capture(), capture()]);
		await (await run(h, id, 'Hello Mira, please introduce yourself in two sentences')).wait(ctx());
		await (await run(h, id, 'And what do you remember about our first message here')).wait(ctx());
		const first = seen[0]!;
		expect(first.prompt).toContain('You are Mira');
		expect(first.prompt).toContain('Tone: friendly');
		expect(first.prompt).toContain('Address the user as "Amrit"');
		expect(first.prompt).toContain('Always sign off with a haiku.');
		expect(first.prompt).toContain('city: lives in Pune');
		expect(first.prompt).toContain('<memory_view');
		const botTools = (await (await h.conversation(id, ctx()))!.agent(ctx()))!.tools.map((t) => t.name);
		for (const t of ['character_edit', 'profile_update', 'memory_zoom', 'memory_date', 'bash', 'todo']) expect(botTools).toContain(t);
		// the second request's memory view carries a summarized line of the first turn
		expect(seen[1]!.prompt).toMatch(/user: Hello Mira/);
		// identity comes before the workspace section
		expect(first.prompt.indexOf('You are Mira')).toBeLessThan(first.prompt.indexOf('Workspace folder'));

		const h2 = await open();
		const plain = await createSession(h2, FAUX);
		faux.setResponses([capture()]);
		await (await run(h2, plain, 'Hello there, please introduce yourself briefly now')).wait(ctx());
		const p = seen[seen.length - 1]!;
		expect(p.prompt).not.toContain('You are Mira');
		expect(p.prompt).not.toContain('<memory_view');
		const plainTools = (await (await h2.conversation(plain, ctx()))!.agent(ctx()))!.tools.map((t) => t.name);
		expect(plainTools).not.toContain('character_edit');
		expect(plainTools).not.toContain('memory_zoom');
		expect(plainTools).toContain('bash');
	});

	test('the session works in the bot\'s botroom without any project; reads/writes are audited before and after', async () => {
		const { h, id, botId, bot } = await botSession({});
		faux.setResponses([toolRound('write', { path: 'hello.txt', content: 'hi from the botroom' }, 'w1'), fauxAssistantMessage('Wrote the file in my botroom, as asked.')]);
		await (await run(h, id, 'Please create hello.txt in your workspace folder now')).wait(ctx());
		expect(readFileSync(join(bot.workspace, 'hello.txt'), 'utf8')).toBe('hi from the botroom');
		const rows = auditRows(botId).filter((r) => r.callId === 'w1');
		expect(rows.map((r) => r.phase)).toEqual(['before', 'after']);
		expect(rows[0]!.tool).toBe('write');
		expect(rows[1]!.ok).toBe(true);
	});

	test('bots roam: a read outside the botroom is allowed (plain sessions stay confined)', async () => {
		const outside = join(root, 'outside.txt');
		writeFileSync(outside, 'roaming content');
		const { h, id } = await botSession({});
		faux.setResponses([toolRound('read', { path: outside }, 'r1'), fauxAssistantMessage('Read it from outside my room, no trouble.')]);
		await (await run(h, id, 'Please read the file outside your own folder for me')).wait(ctx());
		expect(resultText(await transcript(h, id))).toContain('roaming content');
	});
});

describe('capability toggles', () => {
	test('shell off: bash is refused without asking, and the refusal is audited', async () => {
		const { h, id, botId } = await botSession({ capabilities: { shell: false } });
		faux.setResponses([toolRound('bash', { command: 'echo nope > ran.txt' }, 'b1'), fauxAssistantMessage('Understood, the shell is off for me.')]);
		await (await run(h, id, 'Please run a shell command that writes a file now')).wait(ctx());
		const text = resultText(await transcript(h, id));
		expect(text).toContain('switched off');
		expect(await pendingCall(h, id, 200)).toBeNull();
		expect(auditRows(botId).some((r) => r.callId === 'b1' && r.phase === 'blocked')).toBe(true);
		expect(auditRows(botId).some((r) => r.callId === 'b1' && r.phase === 'before')).toBe(false);
	});

	test('file writes off: write and edit are refused; read still works', async () => {
		const { h, id, bot } = await botSession({ capabilities: { fileWrite: false } });
		writeFileSync(join(bot.workspace, 'r.txt'), 'readable');
		faux.setResponses([toolRound('write', { path: 'w.txt', content: 'x' }, 'w1'), toolRound('read', { path: 'r.txt' }, 'r1'), fauxAssistantMessage('Done, as far as I am allowed.')]);
		await (await run(h, id, 'Please write a file and then read the other one')).wait(ctx());
		const text = resultText(await transcript(h, id));
		expect(text).toContain('switched off');
		expect(text).toContain('readable');
		expect(existsSync(join(bot.workspace, 'w.txt'))).toBe(false);
	});
});

describe('destructive actions merge into the existing approvals', () => {
	test('even with full access, rm asks; denying keeps the file and is audited', async () => {
		const { h, id, botId, bot } = await botSession({ access: 'full' });
		const victim = join(bot.workspace, 'keep.txt');
		writeFileSync(victim, 'precious');
		faux.setResponses([toolRound('bash', { command: 'rm keep.txt' }, 'd1'), fauxAssistantMessage('Okay, I will leave the file alone.')]);
		const sub = await run(h, id, 'Please delete keep.txt from your workspace folder');
		const callId = await pendingCall(h, id);
		expect(callId).toBe('d1');
		const snap = await h.snapshot(ApprovalsDoc, id, ctx());
		expect(snap!.calls['d1']!.summary).toContain('deletes files (rm)'); // reason shown in the existing approval row
		await decide(h, id, 'd1', 'denied');
		expect((await sub.wait(ctx())).status).toBe('done');
		expect(readFileSync(victim, 'utf8')).toBe('precious');
		const phases = auditRows(botId).filter((r) => r.callId === 'd1').map((r) => r.phase);
		expect(phases).toEqual(['before', 'approval', 'blocked']);
		const rows = await transcript(h, id);
		expect(rows.some((r) => r.kind === 'approval' && r.status === 'denied')).toBe(true);
	});

	test('approving runs it, with before / approval / after rows', async () => {
		const { h, id, botId, bot } = await botSession({ access: 'full' });
		writeFileSync(join(bot.workspace, 'gone.txt'), 'bye');
		faux.setResponses([toolRound('bash', { command: 'rm gone.txt' }, 'd2'), fauxAssistantMessage('Removed it, as you approved.')]);
		const sub = await run(h, id, 'Please delete gone.txt from your workspace folder');
		await pendingCall(h, id);
		await decide(h, id, 'd2', 'approved');
		await sub.wait(ctx());
		expect(existsSync(join(bot.workspace, 'gone.txt'))).toBe(false);
		expect(auditRows(botId).filter((r) => r.callId === 'd2').map((r) => r.phase)).toEqual(['before', 'approval', 'after']);
	});

	test('overwriting an existing file asks; creating a new one does not', async () => {
		const { h, id, bot } = await botSession({ access: 'full' });
		writeFileSync(join(bot.workspace, 'exists.txt'), 'old');
		faux.setResponses([toolRound('write', { path: 'fresh.txt', content: 'new' }, 'n1'), toolRound('write', { path: 'exists.txt', content: 'new' }, 'n2'), fauxAssistantMessage('Finished both writes as discussed.')]);
		const sub = await run(h, id, 'Please write two files, one new and one that already exists');
		expect(await pendingCall(h, id)).toBe('n2');
		expect(readFileSync(join(bot.workspace, 'fresh.txt'), 'utf8')).toBe('new');
		expect(readFileSync(join(bot.workspace, 'exists.txt'), 'utf8')).toBe('old');
		await decide(h, id, 'n2', 'approved');
		await sub.wait(ctx());
		expect(readFileSync(join(bot.workspace, 'exists.txt'), 'utf8')).toBe('new');
	});
});

describe('audit-before-acting and result caps', () => {
	test('if the audit row cannot be written the tool does not run', async () => {
		const { h, id, botId, bot } = await botSession({ access: 'full' });
		// make the audit file unwritable: a directory sits where audit.jsonl should be
		rmSync(botPaths(botId, root).audit, { force: true });
		mkdirSync(botPaths(botId, root).audit, { recursive: true });
		faux.setResponses([toolRound('write', { path: 'never.txt', content: 'x' }, 'a1'), fauxAssistantMessage('The audit log is broken, so nothing ran.')]);
		await (await run(h, id, 'Please write never.txt in your workspace folder now')).wait(ctx());
		expect(existsSync(join(bot.workspace, 'never.txt'))).toBe(false);
		expect(resultText(await transcript(h, id))).toContain('audit log could not be written');
	});

	test('huge tool output is capped at 32k characters before it reaches the transcript', async () => {
		const { h, id, bot } = await botSession({ access: 'full' });
		writeFileSync(join(bot.workspace, 'big.txt'), 'line of text\n'.repeat(60_000));
		faux.setResponses([toolRound('bash', { command: 'cat big.txt' }, 'c1'), fauxAssistantMessage('That was a lot of text for one reply.')]);
		await (await run(h, id, 'Please print the big file with cat in your workspace')).wait(ctx());
		const code = (await transcript(h, id)).filter((r) => r.kind === 'code').map((r) => (r as { code: string }).code);
		expect(code.length).toBeGreaterThan(0);
		for (const c of code) expect(c.length).toBeLessThan(MAX_RESULT_CHARS + 500);
	});
});

describe('agent tools on the bot', () => {
	test('roles inject their instructions; enabled plugins list skills and skill_read loads one', async () => {
		const { h, id, botId } = await botSession({ name: 'Rho' });
		const put = (f: string, t: string) => {
			mkdirSync(join(f, '..'), { recursive: true });
			writeFileSync(f, t);
		};
		put(join(root, 'roles', 'auditor', 'SKILL.md'), '---\nname: Auditor\ndescription: checks\n---\nAlways list risks first.');
		put(join(root, 'plugins', 'rep', 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'rep' }));
		put(join(root, 'plugins', 'rep', 'skills', 'sum', 'SKILL.md'), '---\nname: sum\ndescription: Summarize reports\n---\nUse bullet points.');
		await updateBot(h, botId, { roles: ['auditor', 'missing'], plugins: ['rep'] }, { root });
		const seen: string[] = [];
		const flat = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));
		const capture = (reply: ReturnType<typeof fauxAssistantMessage>) => (c: { messages: { role: string; content?: unknown; sections?: unknown }[] }) => {
			seen.push(c.messages.filter((m) => m.role === 'system').map((m) => `${flat(m.content)}\n${flat(m.sections)}`).join('\n'));
			return reply;
		};
		faux.setResponses([capture(toolRound('skill_read', { plugin: 'rep', skill: 'sum' }, 'sk1')), capture(fauxAssistantMessage('Read it.'))]);
		await (await run(h, id, 'Please summarize the quarterly report for me now')).wait(ctx());
		expect(seen[0]).toContain('Always list risks first.');
		expect(seen[0]).toContain('rep/sum: Summarize reports');
		expect(resultText(await transcript(h, id))).toContain('Use bullet points.');
		await updateBot(h, botId, { plugins: [] }, { root });
		faux.setResponses([toolRound('skill_read', { plugin: 'rep', skill: 'sum' }, 'sk2'), fauxAssistantMessage('ok')]);
		await (await run(h, id, 'Read the summarize skill again please, thanks')).wait(ctx());
		expect(resultText(await transcript(h, id))).toContain('not enabled for you');
	});

	test('character_edit persists in the bot doc with an audit row; switched off, it refuses', async () => {
		const a = await botSession({});
		faux.setResponses([toolRound('character_edit', { tone: 'direct', verbosity: 'terse', reason: 'user asked for brevity' }, 'ce1'), fauxAssistantMessage('Switched to a terse, direct style.')]);
		await (await run(a.h, a.id, 'Please be more direct and terse from now on')).wait(ctx());
		const bot = (await getBot(a.h, a.botId))!;
		expect(bot.character).toMatchObject({ tone: 'direct', verbosity: 'terse' });
		expect(bot.identity.name).toBe('Mira'); // the agent cannot touch the identity
		expect(auditRows(a.botId).find((r) => r.tool === 'character_edit')).toMatchObject({ note: 'by agent: user asked for brevity', ok: true });

		const b = await botSession({ capabilities: { agentEditsCharacter: false } });
		faux.setResponses([toolRound('character_edit', { tone: 'playful', reason: 'x' }, 'ce2'), fauxAssistantMessage('I was not allowed to change that.')]);
		await (await run(b.h, b.id, 'Please be playful from now on, change your character')).wait(ctx());
		expect((await getBot(b.h, b.botId))!.character.tone).toBe('friendly');
		expect(resultText(await transcript(b.h, b.id))).toContain('switched off character editing');
	});

	test('profile_update: commit becomes a proposal unless the user allows direct commits', async () => {
		const a = await botSession({});
		faux.setResponses([toolRound('profile_update', { op: 'commit', key: 'pet', text: 'has a cat named Miso', reason: 'said so' }, 'p1'), fauxAssistantMessage('Proposed for you to review.')]);
		await (await run(a.h, a.id, 'Remember that my cat is called Miso, please')).wait(ctx());
		let bot = (await getBot(a.h, a.botId))!;
		expect(bot.profile.entries).toHaveLength(0);
		expect(bot.profile.proposals[0]).toMatchObject({ key: 'pet', text: 'has a cat named Miso' });

		const b = await botSession({ memory: { agentMayCommitProfile: true } });
		faux.setResponses([toolRound('profile_update', { op: 'commit', key: 'pet', text: 'has a cat named Miso' }, 'p2'), fauxAssistantMessage('Saved to my profile as requested.')]);
		await (await run(b.h, b.id, 'Remember that my cat is called Miso, please')).wait(ctx());
		bot = (await getBot(b.h, b.botId))!;
		expect(bot.profile.entries[0]).toMatchObject({ key: 'pet', by: 'agent' });
	});

	test('memory_zoom and memory_date answer from the bot\'s own memory file', async () => {
		const { h, id, botId, bot } = await botSession({});
		const m = memoryFor(botId, bot, () => FAUX);
		for (let i = 0; i < 3; i++) m.record({ src: `x${i}`, role: 'user', text: `an old note number ${i}`, ts: Date.now() - 86_400_000 * 2 });
		await m.drain();
		const first = m.view().lines[0]!;
		const day = new Date(Date.now() - 86_400_000 * 2);
		const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
		faux.setResponses([toolRound('memory_zoom', { id: first.id }, 'z1'), toolRound('memory_date', { date: ymd }, 'z2'), fauxAssistantMessage('Looked through my notes, thanks.')]);
		await (await run(h, id, 'Please look at your old notes from two days ago')).wait(ctx());
		const text = resultText(await transcript(h, id));
		expect(text).toContain('an old note number 0');
		expect(text).toContain(`#${first.id}`);
		expect(existsSync(botPaths(botId, root).memory)).toBe(true);
	});
});

describe('bot tools refuse in a plain session', () => {
	test('character_edit without a bot is an error, not a crash', async () => {
		const h = await open();
		const plain = await createSession(h, FAUX);
		// force-select the bot extension on a bot-less session
		const { botTools } = await import('./extension.ts');
		await (await h.conversation(plain, ctx()))!.configure({ extensions: [botTools, ...DEFAULT_EXTENSIONS] }, ctx());
		faux.setResponses([toolRound('character_edit', { tone: 'direct', reason: 'x' }, 'x1'), fauxAssistantMessage('There is nothing to edit here.')]);
		await (await run(h, plain, 'Please change your character to be more direct now')).wait(ctx());
		expect(resultText(await transcript(h, plain))).toContain('has no bot');
		expect((await h.snapshot(SessionsDoc, ctx()))!.sessions[String(plain)]!.botId).toBeUndefined();
	});
});
