import { describe, expect, test } from 'bun:test';
import type { Profile } from './meta.ts';
import { characterOptions, cleanCharacterPatch, capabilityFor, renderCapabilities, renderCharacter, renderIdentity } from './personality.ts';
import { MAX_ENTRIES, MAX_TEXT, profileBytes, propose, removeEntry, renderProfile, resolveProposal, setEntry } from './profile.ts';
import { createBotForTest } from './testing.ts';
import { PERSONALITY_SCHEMA } from './personality-schema.ts';
import { validate } from './schema.ts';
import { personalityView, validateBot } from './meta.ts';

const empty = (): Profile => ({ entries: [], proposals: [], nextId: 1 });

describe('personality schema', () => {
	test('the default bot is valid and the schema reports precise errors', () => {
		const bot = createBotForTest();
		expect(validateBot(bot)).toEqual([]);
		const bad = JSON.parse(JSON.stringify(personalityView(bot))) as Record<string, Record<string, unknown>>;
		bad.character!.tone = 'sarcastic';
		bad.character!.traits = Array.from({ length: 9 }, () => 'x');
		bad.capabilities!.shell = 'yes';
		bad.memory!.viewBudgetChars = 10;
		bad.identity!.extra = 1;
		const errs = validate(PERSONALITY_SCHEMA, bad).join('\n');
		expect(errs).toMatch(/character\.tone: must be one of/);
		expect(errs).toMatch(/traits: allows at most 8/);
		expect(errs).toMatch(/capabilities\.shell: must be true or false/);
		expect(errs).toMatch(/viewBudgetChars: must be >= 2000/);
		expect(errs).toMatch(/identity\.extra: is not a known field/);
	});
	test('form options come from the schema', () => {
		expect(characterOptions().tones).toContain('friendly');
		expect(characterOptions().verbosities).toContain('terse');
	});
});

describe('rendering and capabilities', () => {
	test('sections render identity, character, switched-off capabilities', () => {
		const bot = createBotForTest({ name: 'Mira', character: { tone: 'friendly', traits: ['curious'], addressUserAs: 'Amrit', notes: 'Short answers.' }, capabilities: { shell: false } });
		expect(renderIdentity(bot)).toContain('You are Mira');
		const c = renderCharacter(bot);
		expect(c).toContain('Tone: friendly');
		expect(c).toContain('Address the user as "Amritanshu"'.replace('Amritanshu', 'Amrit'));
		expect(renderCapabilities(bot)).toContain('shell (bash)');
		expect(renderCapabilities(createBotForTest())).toBeUndefined();
	});
	test('tool names map to their capability flag', () => {
		expect(capabilityFor('bash')).toBe('shell');
		expect(capabilityFor('write')).toBe('fileWrite');
		expect(capabilityFor('edit')).toBe('fileWrite');
		expect(capabilityFor('browser_goto')).toBe('browser');
		expect(capabilityFor('character_edit')).toBe('agentEditsCharacter');
		expect(capabilityFor('read')).toBeUndefined();
	});
	test('a character patch with no known field is rejected; unknown fields are dropped', () => {
		expect(() => cleanCharacterPatch({})).toThrow(/No character fields/);
		expect(cleanCharacterPatch({ tone: 'direct', identity: 'x' } as never)).toEqual({ tone: 'direct' });
	});
});

describe('profile', () => {
	test('set / replace / remove, with the byte cap', () => {
		const p = empty();
		expect(setEntry(p, 2000, 'city', 'Pune', 'user', 1)).toBe('added city');
		expect(setEntry(p, 2000, 'city', 'Mumbai', 'user', 2)).toBe('updated city');
		expect(p.entries).toHaveLength(1);
		expect(renderProfile(p)).toBe('- city: Mumbai');
		expect(removeEntry(p, 'city')).toBe('removed city');
		expect(renderProfile(p)).toBeUndefined();
		expect(() => removeEntry(p, 'nope')).toThrow(/No profile entry/);
		expect(() => setEntry(p, 400, 'k', 'x'.repeat(MAX_TEXT), 'user', 1)).not.toThrow();
		expect(() => setEntry(p, 400, 'k2', 'x'.repeat(MAX_TEXT), 'user', 1)).toThrow(/profile is full/);
		expect(profileBytes(p)).toBeLessThanOrEqual(400);
	});
	test('validation: key charset, one line, length, entry count', () => {
		const p = empty();
		expect(() => setEntry(p, 8000, 'bad key', 'x', 'user', 1)).toThrow(/Invalid key/);
		expect(() => setEntry(p, 8000, 'k', 'a\nb', 'user', 1)).toThrow(/one line/);
		expect(() => setEntry(p, 8000, 'k', '', 'user', 1)).toThrow(/empty/);
		expect(() => setEntry(p, 8000, 'k', 'x'.repeat(MAX_TEXT + 1), 'user', 1)).toThrow(/limit/);
		for (let i = 0; i < MAX_ENTRIES; i++) setEntry(p, 8000, `k${i}`, 'v', 'user', 1);
		expect(() => setEntry(p, 8000, 'extra', 'v', 'user', 1)).toThrow(/already has/);
	});
	test('proposals: propose, replace by key, accept (needs room), reject', () => {
		const p = empty();
		propose(p, 'pet', 'cat', 'said so', 1);
		expect(propose(p, 'pet', 'dog', 'corrected', 2)).toMatch(/replaced/);
		expect(p.proposals).toHaveLength(1);
		expect(resolveProposal(p, 2000, p.proposals[0]!.id, true, 3)).toMatch(/accepted/);
		expect(p.entries[0]).toMatchObject({ key: 'pet', text: 'dog', by: 'agent' });
		propose(p, 'x', 'y', '', 4);
		expect(resolveProposal(p, 2000, p.proposals[0]!.id, false, 5)).toMatch(/rejected/);
		expect(p.proposals).toHaveLength(0);
		expect(() => resolveProposal(p, 2000, 99, true, 6)).toThrow(/No proposal/);
	});
});
