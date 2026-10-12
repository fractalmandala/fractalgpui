import { describe, expect, test, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
	Harness,
	MemoryStorage,
	createRegistry,
	type ConversationId,
	type Harness as HarnessType
} from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createModels } from '@earendil-works/pi-ai/models';
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall
} from '@earendil-works/pi-ai/providers/faux';
import { SessionsDoc, freshSession } from './metadata.ts';
import { ApprovalsDoc, TodosDoc, installAgentTools } from './tools.ts';
import { projectEntries } from './project.ts';

const ctx = () => BACKGROUND_CONTEXT;
const FAUX = { provider: 'faux', modelId: 'faux-1' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const root = mkdtempSync(join(tmpdir(), 'fractalgpui-tools-'));
const workspace = join(root, 'ws');
mkdirSync(workspace, { recursive: true });
afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

const models = createModels();
const faux = fauxProvider();
models.setProvider(faux.provider);

let harness: HarnessType | null = null;
async function testHarness(): Promise<HarnessType> {
	if (!harness) {
		const registry = createRegistry();
		installAgentTools(registry);
		harness = await Harness.open(
			new MemoryStorage(),
			{
				models,
				registry,
				env: (target) => new NodeExecutionEnv({ cwd: target.cwd ?? root, shellEnv: process.env })
			},
			ctx()
		);
		harness.resume();
	}
	return harness;
}

/** A session with a workspace project, ready for tool runs. */
async function makeSession(
	h: HarnessType,
	over: { access?: 'supervised' | 'edits' | 'full'; agentType?: 'plan' | 'build' | 'ask'; project?: boolean }
): Promise<ConversationId> {
	const conv = await h.createConversation(
		{ ownership: { kind: 'ownerless' }, agent: { model: FAUX, cwd: workspace } },
		ctx()
	);
	const now = Date.now();
	await h.commit(async (tx) => {
		const d = await tx.doc(SessionsDoc);
		d.sessions[String(conv.id)] = {
			...freshSession(now, FAUX.provider, FAUX.modelId),
			access: over.access ?? 'supervised',
			agentType: over.agentType ?? 'build',
			...(over.project === false ? {} : { folder: workspace })
		};
	}, ctx());
	return conv.id;
}

async function pendingCall(
	h: HarnessType,
	id: ConversationId,
	timeoutMs = 10000
): Promise<string | null> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		const snap = await h.snapshot(ApprovalsDoc, id, ctx());
		const found = Object.entries(snap?.calls ?? {}).find(([, c]) => c.status === 'pending');
		if (found) return found[0];
		await sleep(100);
	}
	return null;
}

async function decide(h: HarnessType, id: ConversationId, callId: string, status: 'approved' | 'denied'): Promise<void> {
	await h.commit(async (tx) => {
		const d = await tx.doc(ApprovalsDoc, id);
		if (d.calls[callId]) d.calls[callId].status = status;
	}, ctx());
}

async function transcript(h: HarnessType, id: ConversationId) {
	const conv = await h.conversation(id, ctx());
	if (!conv) throw new Error('conversation missing');
	const entries = await conv.entries({}, 200, undefined, ctx());
	const approvals = await h.snapshot(ApprovalsDoc, id, ctx());
	return projectEntries(entries.items, undefined, approvals ? { 'fractal.approvals': approvals } : undefined);
}

async function approvalKinds(h: HarnessType, id: ConversationId): Promise<string[]> {
	const conv = await h.conversation(id, ctx());
	if (!conv) throw new Error('conversation missing');
	const entries = await conv.entries({}, 200, undefined, ctx());
	return entries.items.map((e) => e.kind);
}

describe('tool runs end to end', () => {
	test('supervised write asks, approval runs it in the session folder', async () => {
		const h = await testHarness();
		const id = await makeSession(h, {});
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall('write', { path: 'note2.txt', content: 'written after approval' }, { id: 'w1' })], { stopReason: 'toolUse' }),
			fauxAssistantMessage('All done now, thanks for waiting patiently.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please write the second note file in the workspace folder' }, ctx());
		const callId = await pendingCall(h, id);
		expect(callId).not.toBeNull();
		await decide(h, id, callId!, 'approved');
		expect((await sub.wait(ctx())).status).toBe('done');
		const rows = await transcript(h, id);
		const approval = rows.find((r) => r.kind === 'approval');
		expect(approval && approval.kind === 'approval' ? approval.status : undefined).toBe('approved');
		expect(rows.some((r) => r.kind === 'assistant' && r.text.includes('All done now'))).toBe(true);
		expect(readFileSync(join(workspace, 'note2.txt'), 'utf8')).toBe('written after approval');
	});

	test('denying keeps the run going with the denial recorded', async () => {
		const h = await testHarness();
		const id = await makeSession(h, {});
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall('write', { path: 'note3.txt', content: 'must never land' }, { id: 'w2' })], { stopReason: 'toolUse' }),
			fauxAssistantMessage('Understood the refusal, will work another way instead.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please write the third note file for this denial check' }, ctx());
		const callId = await pendingCall(h, id);
		expect(callId).not.toBeNull();
		await decide(h, id, callId!, 'denied');
		expect((await sub.wait(ctx())).status).toBe('done');
		const rows = await transcript(h, id);
		const denial = rows.find((r) => r.kind === 'approval');
		expect(denial && denial.kind === 'approval' ? denial.status : undefined).toBe('denied');
		expect(rows.some((r) => r.kind === 'assistant' && r.text.includes('will work another way'))).toBe(true);
		expect(existsSync(join(workspace, 'note3.txt'))).toBe(false);
	});

	test('full access runs without asking and leaves no approval row', async () => {
		writeFileSync(join(workspace, 'note.txt'), 'hello from the workspace');
		const h = await testHarness();
		const id = await makeSession(h, { access: 'full' });
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall('read', { path: 'note.txt' }, { id: 'r3' })], { stopReason: 'toolUse' }),
			fauxAssistantMessage('Read it directly without any approval step now.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please read the note file with full access enabled' }, ctx());
		expect((await sub.wait(ctx())).status).toBe('done');
		expect(await approvalKinds(h, id)).not.toContain('fractal.approval');
		const rows = await transcript(h, id);
		expect(rows.some((r) => r.kind === 'code' && r.code.includes('hello from the workspace'))).toBe(true);
	});

	test('plan mode refuses changes without asking', async () => {
		const h = await testHarness();
		const id = await makeSession(h, { agentType: 'plan' });
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall('write', { path: 'note.txt', content: 'x' }, { id: 'w1' })], {
				stopReason: 'toolUse'
			}),
			fauxAssistantMessage('Noted the plan-mode refusal and described the work instead.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please write to the note file while planning the task' }, ctx());
		expect((await sub.wait(ctx())).status).toBe('done');
		expect(await approvalKinds(h, id)).not.toContain('fractal.approval');
		const rows = await transcript(h, id);
		expect(rows.some((r) => r.kind === 'code' && r.code.includes('plan mode'))).toBe(true);
	});

	test('no workspace refuses file calls with the reason', async () => {
		const h = await testHarness();
		const id = await makeSession(h, { project: false });
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall('read', { path: 'note.txt' }, { id: 'r4' })], { stopReason: 'toolUse' }),
			fauxAssistantMessage('Heard the refusal about the missing workspace folder.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please read the note file with no workspace attached' }, ctx());
		expect((await sub.wait(ctx())).status).toBe('done');
		const rows = await transcript(h, id);
		expect(rows.some((r) => r.kind === 'code' && r.code.includes('No workspace'))).toBe(true);
	});

	test('paths outside the workspace refuse even when approved would apply', async () => {
		const outside = join(root, 'outside.txt');
		writeFileSync(outside, 'secret\n');
		const h = await testHarness();
		const id = await makeSession(h, {});
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall('read', { path: outside }, { id: 'r5' })], { stopReason: 'toolUse' }),
			fauxAssistantMessage('Heard the confinement refusal and stayed inside instead.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please read the outside file from beyond the workspace' }, ctx());
		expect((await sub.wait(ctx())).status).toBe('done');
		expect(await approvalKinds(h, id)).not.toContain('fractal.approval');
		const rows = await transcript(h, id);
		expect(rows.some((r) => r.kind === 'code' && r.code.includes('outside the workspace'))).toBe(true);
		expect(rows.some((r) => r.kind === 'code' && r.code.includes('secret'))).toBe(false);
	});

	test('the todo tool records the run step list', async () => {
		const h = await testHarness();
		const id = await makeSession(h, { access: 'full' });
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([
			fauxAssistantMessage(
				[
					fauxToolCall(
						'todo',
						{ todos: [{ content: 'First step', status: 'in_progress' }, { content: 'Second', status: 'pending' }] },
						{ id: 't1' }
					)
				],
				{ stopReason: 'toolUse' }
			),
			fauxAssistantMessage('Steps are now tracked for the current working session.')
		]);
		const sub = await conv.submit({ type: 'input', content: 'Please declare the steps for this tracked working session' }, ctx());
		expect((await sub.wait(ctx())).status).toBe('done');
		const todos = await h.snapshot(TodosDoc, id, ctx());
		expect(todos?.items.map((i) => `${i.status}:${i.text}`)).toEqual(['in_progress:First step', 'pending:Second']);
	});
});
