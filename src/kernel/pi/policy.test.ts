import { describe, expect, test } from 'bun:test';
import { classify } from './tools.ts';
import type { AccessMode, AgentType } from './metadata.ts';

const modes: AccessMode[] = ['supervised', 'edits', 'full'];
const types: AgentType[] = ['plan', 'build', 'ask'];

describe('classify', () => {
	test('todo bookkeeping always runs, workspace or not', () => {
		for (const access of modes) {
			for (const type of types) {
				expect(classify(access, type, 'meta', false)).toEqual({ kind: 'allow' });
				expect(classify(access, type, 'meta', true)).toEqual({ kind: 'allow' });
			}
		}
	});

	test('without a workspace every file/shell call refuses', () => {
		for (const access of modes) {
			expect(classify(access, 'build', 'read', false).kind).toBe('refuse');
			expect(classify(access, 'build', 'write', false).kind).toBe('refuse');
			expect(classify(access, 'build', 'exec', false).kind).toBe('refuse');
		}
		const verdict = classify('supervised', 'build', 'write', false);
		if (verdict.kind !== 'refuse') throw new Error('expected refuse');
		expect(verdict.reason).toMatch('No workspace');
	});

	test('plan and ask refuse changes but allow reads', () => {
		for (const type of ['plan', 'ask'] as const) {
			expect(classify('full', type, 'write', true).kind).toBe('refuse');
			expect(classify('full', type, 'exec', true).kind).toBe('refuse');
			expect(classify('supervised', type, 'read', true)).toEqual({ kind: 'allow' });
			const verdict = classify('full', type, 'write', true);
			if (verdict.kind !== 'refuse') throw new Error('expected refuse');
			expect(verdict.reason).toMatch(type);
		}
	});

	test('supervised asks for everything but reads', () => {
		expect(classify('supervised', 'build', 'read', true)).toEqual({ kind: 'allow' });
		expect(classify('supervised', 'build', 'write', true)).toEqual({ kind: 'ask' });
		expect(classify('supervised', 'build', 'exec', true)).toEqual({ kind: 'ask' });
	});

	test('auto-accept edits proceeds on writes, asks on commands', () => {
		expect(classify('edits', 'build', 'read', true)).toEqual({ kind: 'allow' });
		expect(classify('edits', 'build', 'write', true)).toEqual({ kind: 'allow' });
		expect(classify('edits', 'build', 'exec', true)).toEqual({ kind: 'ask' });
	});

	test('full access allows everything with a workspace', () => {
		expect(classify('full', 'build', 'read', true)).toEqual({ kind: 'allow' });
		expect(classify('full', 'build', 'write', true)).toEqual({ kind: 'allow' });
		expect(classify('full', 'build', 'exec', true)).toEqual({ kind: 'allow' });
	});
});
