import { describe, expect, test } from 'bun:test';
import type { EntryRecord } from '@earendil-works/pi-durable';
import { formatUsage, isBusy, projectEntries, transcriptText } from './project.ts';

const entry = (kind: string, model?: unknown, id = kind, data?: unknown): EntryRecord =>
	({ id, conversationId: 'c', kind, model: model as EntryRecord['model'], data }) as unknown as EntryRecord;

const user = (text: string) => entry('pi.user', [{ role: 'user', content: text, timestamp: 1 }]);
const assistant = (blocks: unknown[]) => entry('pi.assistant', [{ role: 'assistant', content: blocks, timestamp: 2 }]);

describe('projectEntries', () => {
	test('user text becomes a user row', () => {
		const rows = projectEntries([user('hi')], undefined);
		expect(rows).toEqual([{ kind: 'user', text: 'hi' }]);
	});

	test('assistant blocks split into thinking, tool and text rows', () => {
		const rows = projectEntries(
			[
				assistant([
					{ type: 'thinking', thinking: 'hmm' },
					{ type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'a.ts' } },
					{ type: 'text', text: 'done' }
				])
			],
			undefined
		);
		expect(rows).toEqual([
			{ kind: 'thinking', text: 'hmm' },
			{ kind: 'tool', label: 'read', detail: '{"path":"a.ts"}', failed: false },
			{ kind: 'assistant', text: 'done' }
		]);
	});

	test('reset and compaction become notices; unknowns are skipped', () => {
		const rows = projectEntries([entry('pi.reset'), entry('pi.system'), entry('pi.compaction')], undefined);
		expect(rows.map((r) => r.kind)).toEqual(['notice', 'notice']);
	});

	test('an in-flight partial appends once and vanishes on commit', () => {
		const live = { generation: { message: { content: [{ type: 'text', text: 'Par' }] } } };
		expect(projectEntries([user('hi')], live)).toEqual([
			{ kind: 'user', text: 'hi' },
			{ kind: 'assistant', text: 'Par' }
		]);
		expect(projectEntries([user('hi'), assistant([{ type: 'text', text: 'Paris.' }])], undefined)).toEqual([
			{ kind: 'user', text: 'hi' },
			{ kind: 'assistant', text: 'Paris.' }
		]);
	});

	test('approval rows take their status from the approvals doc', () => {
		const e = entry('fractal.approval', undefined, 'a1', { callId: 'c1', tool: 'bash', summary: 'rm -rf /tmp/x', args: '{}', status: 'pending' });
		expect(projectEntries([e], undefined)).toEqual([
			{ kind: 'approval', callId: 'c1', tool: 'bash', summary: 'rm -rf /tmp/x', detail: '{}', status: 'pending' }
		]);
		const docs = { 'fractal.approvals': { calls: { c1: { status: 'approved' } } } };
		expect(projectEntries([e], undefined, docs)[0]).toMatchObject({ kind: 'approval', status: 'approved' });
		const denied = { 'fractal.approvals': { calls: { c1: { status: 'denied' } } } };
		expect(projectEntries([e], undefined, denied)[0]).toMatchObject({ kind: 'approval', status: 'denied' });
	});

	test('approval entries without a call id are skipped', () => {
		expect(projectEntries([entry('fractal.approval', undefined, 'a2', { tool: 'bash' })], undefined)).toEqual([]);
	});

	test('live tool slots render while running, finished ones are skipped', () => {
		const live = {
			tools: [
				{ name: 'read', status: 'running', output: 'line one\nline two' },
				{ name: 'bash', status: 'pending' },
				{ name: 'edit', status: 'done', entry: 'e9' }
			]
		};
		expect(projectEntries([], live)).toEqual([
			{ kind: 'tool', label: 'read', detail: 'running: line one\nline two', failed: false },
			{ kind: 'tool', label: 'bash', detail: 'pending', failed: false }
		]);
	});
	test('a call whose committed result errored renders as failed', () => {
		const call = entry('pi.assistant', [{ role: 'assistant', content: [{ type: 'toolCall', id: 't9', name: 'bash', arguments: { command: 'exit 1' } }] }]);
		const okResult = entry('pi.tool-result', [{ role: 'toolResult', toolCallId: 't1', toolName: 'bash', content: [{ type: 'text', text: 'fine' }], isError: false }]);
		const badResult = entry('pi.tool-result', [{ role: 'toolResult', toolCallId: 't9', toolName: 'bash', content: [{ type: 'text', text: 'boom' }], isError: true }]);
		const rows = projectEntries([call, okResult, badResult], undefined);
		expect(rows.filter((r) => r.kind === 'tool')).toEqual([
			{ kind: 'tool', label: 'bash', detail: '{"command":"exit 1"}', failed: true }
		]);
	});

describe('transcriptText', () => {
	test('every row kind renders as one text block', () => {
		expect(
			transcriptText([
				{ kind: 'user', text: 'hi' },
				{ kind: 'thinking', text: 'hmm' },
				{ kind: 'assistant', text: 'hello' },
				{ kind: 'code', code: 'x', language: 'text' },
				{ kind: 'tool', label: 'read', detail: '{}', failed: true },
				{ kind: 'approval', callId: 'c', tool: 'bash', summary: 'run it', detail: '{}', status: 'denied' },
				{ kind: 'notice', text: 'reset' }
			])
		).toBe('You: hi\n\nThinking: hmm\n\nhello\n\nx\n\nread {} (failed)\n\nApproval (denied): run it {}\n\nreset');
	});
});

});

describe('isBusy', () => {
	test('run present means busy', () => {
		expect(isBusy({ run: { taskId: 't', inputs: [] } })).toBe(true);
		expect(isBusy({})).toBe(false);
		expect(isBusy(undefined)).toBe(false);
	});
});

describe('formatUsage', () => {
	test('sums model spend, quiet when empty', () => {
		expect(formatUsage(undefined)).toBe('$0.00 · 0 tokens');
		expect(formatUsage({ 'pi.usage': { models: { 'faux/faux-1': { totalTokens: 10, cost: { total: 0.001 } } }, tools: {} } })).toBe(
			'$0.0010 · 10 tokens'
		);
	});
});
