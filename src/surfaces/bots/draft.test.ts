import { describe, expect, test } from 'bun:test';
import { createBotForTest } from '../../kernel/pi/bots/testing.ts';
import { draftOf, isDirty, patchOf, showValue, splitList, splitModel, wholeNumber } from './draft.ts';

describe('bot draft', () => {
	const bot = createBotForTest({ name: 'Mira', character: { traits: ['calm', 'curious'], tone: 'friendly' }, roles: ['researcher'] });

	test('a fresh draft has nothing to save', () => {
		expect(patchOf(bot, draftOf(bot))).toEqual({});
		expect(isDirty(bot, draftOf(bot))).toBe(false);
	});
	test('only changed fields go in the patch', () => {
		const d = draftOf(bot);
		d.tone = 'formal';
		d.traits = 'calm, curious, terse';
		d.capabilities.browser = false;
		d.memory.fan = 4;
		const p = patchOf(bot, d);
		expect(p).toEqual({ character: { tone: 'formal', traits: ['calm', 'curious', 'terse'] }, capabilities: { shell: true, fileWrite: true, browser: false, agentEditsCharacter: true }, memory: { ...bot.memory, fan: 4 } });
		expect(isDirty(bot, d)).toBe(true);
	});
	test('lists ignore spacing and duplicates, and reordering is a change', () => {
		expect(splitList(' a, b ,a,, c ')).toEqual(['a', 'b', 'c']);
		const d = draftOf(bot);
		d.traits = ' calm ,curious';
		expect(patchOf(bot, d)).toEqual({});
		d.roles = 'researcher, writer';
		expect(patchOf(bot, d)).toEqual({ roles: ['researcher', 'writer'] });
	});
	test('workspace and avatar: empty means botroom / generated', () => {
		const d = draftOf(bot);
		d.workspace = '/tmp/work';
		d.avatar = '/tmp/a.png';
		expect(patchOf(bot, d)).toEqual({ workspace: '/tmp/work', avatar: '/tmp/a.png' });
		const assigned = { ...bot, workspaceIsBotroom: false, workspace: '/tmp/work', avatar: '/tmp/a.png' };
		const e = draftOf(assigned);
		expect(patchOf(assigned, e)).toEqual({});
		e.workspace = '  ';
		e.avatar = '';
		expect(patchOf(assigned, e)).toEqual({ workspace: null, avatar: null });
	});
	test('the memory model is a plain memory field', () => {
		const d = draftOf(bot);
		d.memory.summaryModel = 'anthropic/claude-haiku';
		expect(patchOf(bot, d).memory?.summaryModel).toBe('anthropic/claude-haiku');
		expect(splitModel('anthropic/claude-haiku')).toEqual({ provider: 'anthropic', modelId: 'claude-haiku' });
		expect(splitModel('openrouter/meta/llama')).toEqual({ provider: 'openrouter', modelId: 'meta/llama' });
		expect(splitModel('')).toBeNull();
		expect(splitModel('noslash')).toBeNull();
	});
	test('wholeNumber keeps the old value for junk', () => {
		expect(wholeNumber('12', 5)).toBe(12);
		expect(wholeNumber('x', 5)).toBe(5);
		expect(wholeNumber('-3', 5)).toBe(5);
		expect(wholeNumber('2.5', 5)).toBe(5);
		expect(wholeNumber('0', 5, 1)).toBe(5);
	});
	test('values read short in the preview', () => {
		expect(showValue('')).toBe('(empty)');
		expect(showValue(undefined)).toBe('(none)');
		expect(showValue(['a'])).toBe('["a"]');
		expect(showValue('x'.repeat(100)).length).toBe(58);
	});
});
