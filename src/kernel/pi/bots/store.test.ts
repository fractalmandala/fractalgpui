import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Harness, MemoryStorage, createRegistry, type Harness as HarnessType } from '@earendil-works/pi-durable';
import { createModels } from '@earendil-works/pi-ai/models';
import { SessionsDoc } from '../metadata.ts';
import { createSession, ensureIndex } from '../sessions-io.ts';
import { DEFAULT_EXTENSIONS, installAgentTools, installBotTools } from '../tools.ts';
import { avatarFallback, BOT_SCHEMA_VERSION, BotsDoc, diffValues, newBotId, slugify, upgradeBot, validateBot } from './meta.ts';
import { botPaths } from './paths.ts';
import { createBot, deleteBot, duplicateBot, getBot, listBots, setIdentity, updateBot, watchBots } from './store.ts';

const ctx = () => BACKGROUND_CONTEXT;
const FAUX = { provider: 'faux', modelId: 'faux-1' };
const root = mkdtempSync(join(tmpdir(), 'fractalgpui-bots-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function open(): Promise<HarnessType> {
	const registry = createRegistry();
	installAgentTools(registry);
	installBotTools(registry);
	const h = await Harness.open(new MemoryStorage(), { models: createModels(), registry, settings: { extensions: DEFAULT_EXTENSIONS } }, ctx());
	h.resume();
	await ensureIndex(h, () => {}, FAUX);
	return h;
}
const o = { root };

describe('bot ids, slugs, avatars', () => {
	test('ids are bot_ + 10 base36 chars and do not repeat', () => {
		const ids = new Set(Array.from({ length: 200 }, newBotId));
		expect(ids.size).toBe(200);
		for (const id of ids) expect(id).toMatch(/^bot_[a-z0-9]{10}$/);
	});
	test('slugify is safe for folder names', () => {
		expect(slugify('  Ravi’s Bot / 2! ')).toBe('ravi-s-bot-2');
		expect(slugify('???')).toBe('bot');
		expect(slugify('../../etc')).toBe('etc');
	});
	test('generated avatar is deterministic and uses the initial', () => {
		const a = avatarFallback('bot_x', 'Mira');
		expect(a).toEqual(avatarFallback('bot_x', 'Mira'));
		expect(a.initial).toBe('M');
		expect(a.hue).toBeGreaterThanOrEqual(0);
		expect(a.hue).toBeLessThan(360);
		expect(avatarFallback('bot_y', 'Mira').hue).not.toBe(a.hue);
		expect(avatarFallback('bot_x', '').initial).toBe('?');
	});
	test('diffValues lists leaf paths', () => {
		expect(diffValues({ a: { b: 1, c: [1] }, d: 1 }, { a: { b: 2, c: [1] }, d: 1 })).toEqual([{ path: 'a.b', before: 1, after: 2 }]);
		expect(diffValues({ a: 1 }, { a: 1 })).toEqual([]);
	});
});

describe('create', () => {
	test('stores the bot with defaults, creates its folders and a botroom workspace', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Mira' }, o);
		const bot = (await getBot(h, id))!;
		expect(bot.schema).toBe(BOT_SCHEMA_VERSION);
		expect(bot.identity.name).toBe('Mira');
		expect(bot.identity.createdAt).toBeGreaterThan(0);
		expect(bot.capabilities).toEqual({ shell: true, fileWrite: true, browser: true, agentEditsCharacter: true });
		expect(bot.workspaceIsBotroom).toBe(true);
		expect(bot.workspace).toBe(join(root, 'botroom', 'mira'));
		expect(existsSync(bot.workspace)).toBe(true);
		const p = botPaths(id, root);
		for (const d of [p.home, p.browserProfile, p.media]) expect(existsSync(d)).toBe(true);
		expect(bot.avatar).toBeUndefined();
		expect(validateBot(bot)).toEqual([]);
	});

	test('two bots with the same name get distinct botrooms', async () => {
		const h = await open();
		const a = (await getBot(h, await createBot(h, { name: 'Twin' }, o)))!;
		const b = (await getBot(h, await createBot(h, { name: 'Twin' }, o)))!;
		expect(a.workspace).not.toBe(b.workspace);
		expect(existsSync(b.workspace)).toBe(true);
	});

	test('an assigned workspace is used as is and must exist', async () => {
		const h = await open();
		const dir = join(root, 'assigned');
		mkdirSync(dir, { recursive: true });
		const bot = (await getBot(h, await createBot(h, { name: 'Ana', workspace: dir }, o)))!;
		expect(bot).toMatchObject({ workspace: dir, workspaceIsBotroom: false });
		await expect(createBot(h, { name: 'Bad', workspace: join(root, 'nope') }, o)).rejects.toThrow(/No such folder/);
	});

	test('invalid input creates nothing (no row, no folders)', async () => {
		const h = await open();
		const before = readdirSync(join(root, 'bots')).length;
		await expect(createBot(h, { name: '   ' }, o)).rejects.toThrow(/needs a name/);
		await expect(createBot(h, { name: 'x'.repeat(41) }, o)).rejects.toThrow(/Invalid bot.*name/);
		await expect(createBot(h, { name: 'Ok', character: { tone: 'sarcastic' } }, o)).rejects.toThrow(/Invalid bot.*tone/);
		expect(readdirSync(join(root, 'bots')).length).toBe(before);
	});
});

describe('save: identity locked, character editable, diff returned', () => {
	test('updateBot returns the diff and writes once; a no-op writes nothing', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Iris' }, o);
		const r = await updateBot(h, id, { character: { tone: 'friendly', traits: ['curious'] }, capabilities: { shell: false } }, o);
		expect(r.diff.map((d) => d.path).sort()).toEqual(['capabilities.shell', 'character.tone', 'character.traits']);
		expect(r.diff.find((d) => d.path === 'character.tone')).toEqual({ path: 'character.tone', before: 'neutral', after: 'friendly' });
		const stored = (await getBot(h, id))!;
		expect(stored.character.tone).toBe('friendly');
		expect(stored.capabilities.shell).toBe(false);
		const again = await updateBot(h, id, { character: { tone: 'friendly' } }, o);
		expect(again.diff).toEqual([]);
		expect((await getBot(h, id))!.updatedAt).toBe(stored.updatedAt);
	});

	test('dryRun computes the diff without saving', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Dry' }, o);
		const r = await updateBot(h, id, { character: { verbosity: 'terse' } }, { ...o, dryRun: true });
		expect(r.diff.map((d) => d.path)).toEqual(['character.verbosity']);
		expect((await getBot(h, id))!.character.verbosity).toBe('normal');
	});

	test('an invalid patch is rejected and leaves the stored bot untouched', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Val' }, o);
		await expect(updateBot(h, id, { character: { tone: 'sarcastic' } }, o)).rejects.toThrow(/tone/);
		await expect(updateBot(h, id, { memory: { viewBudgetChars: 10 } }, o)).rejects.toThrow(/viewBudgetChars/);
		expect((await getBot(h, id))!.character.tone).toBe('neutral');
	});

	test('the identity cannot be changed through update, only through confirmed setIdentity', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Lock' }, o);
		await expect(updateBot(h, id, { identity: { name: 'Evil' } } as never, o)).rejects.toThrow(/locked/);
		await expect(updateBot(h, id, { name: 'Evil' } as never, o)).rejects.toThrow(/locked/);
		await expect(setIdentity(h, id, { name: 'Evil' }, false, o)).rejects.toThrow(/locked/);
		expect((await getBot(h, id))!.identity.name).toBe('Lock');
		const r = await setIdentity(h, id, { name: 'Robo', role: 'helper' }, true, o);
		expect(r.diff.map((d) => d.path).sort()).toEqual(['identity.name', 'identity.role']);
		const bot = (await getBot(h, id))!;
		expect(bot.identity).toMatchObject({ name: 'Robo', role: 'helper' });
		expect(bot.identity.createdAt).toBeGreaterThan(0);
	});

	test('avatar, roles, workspace assign and reset; unknown keys refused', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Wsp' }, o);
		const dir = join(root, 'elsewhere');
		mkdirSync(dir, { recursive: true });
		const r = await updateBot(h, id, { avatar: '/tmp/a.png', roles: ['researcher'], workspace: dir }, o);
		expect(r.bot).toMatchObject({ avatar: '/tmp/a.png', roles: ['researcher'], workspace: dir, workspaceIsBotroom: false });
		const back = await updateBot(h, id, { avatar: null, workspace: null }, o);
		expect(back.bot.avatar).toBeUndefined();
		expect(back.bot.workspaceIsBotroom).toBe(true);
		expect(existsSync(back.bot.workspace)).toBe(true);
		await expect(updateBot(h, id, { workspace: join(root, 'nope') }, o)).rejects.toThrow(/No such folder/);
		await expect(updateBot(h, id, { bogus: 1 } as never, o)).rejects.toThrow(/Unknown bot field/);
	});

	test('user edits write an audit row in the bot home', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Aud' }, o);
		await updateBot(h, id, { character: { tone: 'direct' } }, o);
		const rows = (await import('../audit.ts')).AuditLog.prototype.read.call({ file: botPaths(id, root).audit });
		expect(rows.map((r) => r.tool)).toEqual(['bot_create', 'bot_update']);
		expect(rows[1]).toMatchObject({ summary: 'character.tone', note: 'by user' });
	});
});

describe('duplicate, list, upgrade, watch', () => {
	test('duplicate copies the setup (not sessions) into a new bot with its own botroom', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Src', character: { tone: 'playful' }, capabilities: { browser: false } }, o);
		await updateBot(h, id, { roles: ['writer'] }, o);
		const s = await createSession(h, null, FAUX, { botId: id });
		const copyId = await duplicateBot(h, id, undefined, o);
		const copy = (await getBot(h, copyId))!;
		const src = (await getBot(h, id))!;
		expect(copyId).not.toBe(id);
		expect(copy.identity.name).toBe('Src copy');
		expect(copy.character.tone).toBe('playful');
		expect(copy.capabilities.browser).toBe(false);
		expect(copy.roles).toEqual(['writer']);
		expect(copy.workspace).not.toBe(src.workspace);
		const sessions = (await h.snapshot(SessionsDoc, ctx()))!.sessions;
		expect(Object.values(sessions).filter((m) => m.botId === copyId)).toHaveLength(0);
		expect(sessions[String(s)]!.botId).toBe(id);
	});

	test('listBots orders by recent update', async () => {
		const h = await open();
		const t = { ...o, now: () => 1000 };
		const a = await createBot(h, { name: 'Old' }, t);
		const b = await createBot(h, { name: 'New' }, { ...o, now: () => 2000 });
		expect((await listBots(h)).map((x) => x.id)).toEqual([b, a]);
	});

	test('upgradeBot is a no-op at the current version and stamps older rows', () => {
		const bot = { schema: 0 } as never;
		expect(upgradeBot(bot).schema).toBe(BOT_SCHEMA_VERSION);
	});

	test('watchBots mirrors changes', async () => {
		const h = await open();
		let seen: string[] = [];
		const stop = await watchBots(h, (i) => (seen = Object.keys(i.bots)));
		const id = await createBot(h, { name: 'Wat' }, o);
		for (let i = 0; i < 40 && !seen.includes(id); i++) await new Promise((r) => setTimeout(r, 50));
		expect(seen).toContain(id);
		stop();
	});
});

describe('delete keeps sessions', () => {
	test('sessions survive, detached as plain sessions; the botroom and files stay', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Gone' }, o);
		const bot = (await getBot(h, id))!;
		const s1 = await createSession(h, null, FAUX, { botId: id });
		const s2 = await createSession(h, null, FAUX, { botId: id });
		const plain = await createSession(h, null, FAUX);
		const other = await createBot(h, { name: 'Other' }, o);
		const s3 = await createSession(h, null, FAUX, { botId: other });
		const r = await deleteBot(h, id, o);
		expect(r.detached.sort()).toEqual([String(s1), String(s2)].sort());
		const snap = (await h.snapshot(SessionsDoc, ctx()))!;
		for (const sid of [s1, s2]) {
			expect(snap.sessions[String(sid)]).toBeDefined();
			expect('botId' in snap.sessions[String(sid)]!).toBe(false);
		}
		expect(snap.sessions[String(plain)]).toBeDefined();
		expect(snap.sessions[String(s3)]!.botId).toBe(other);
		expect(await getBot(h, id)).toBeUndefined();
		expect(existsSync(bot.workspace)).toBe(true);
		expect(existsSync(botPaths(id, root).home)).toBe(true);
		// the detached session no longer selects the bot extension
		const conv = (await h.conversation(s1, ctx()))!;
		const agent = await conv.agent(ctx());
		expect(agent?.extensions.map((e) => e.name)).toContain("fractal-tools");
		expect(agent?.extensions.map((e) => e.name)).not.toContain("fractal-bot");
		await expect(deleteBot(h, id, o)).rejects.toThrow(/No such bot/);
	});

	test('removeHome also deletes the bot home folder', async () => {
		const h = await open();
		const id = await createBot(h, { name: 'Wipe' }, o);
		await deleteBot(h, id, { ...o, removeHome: true });
		expect(existsSync(botPaths(id, root).home)).toBe(false);
	});
});

describe('sessions without a bot', () => {
	test('stay plain: no botId key, no explicit extensions', async () => {
		const h = await open();
		const s = await createSession(h, null, FAUX);
		const meta = (await h.snapshot(SessionsDoc, ctx()))!.sessions[String(s)]!;
		expect('botId' in meta).toBe(false);
		const agent = await (await h.conversation(s, ctx()))!.agent(ctx());
		expect(agent?.extensions.map((e) => e.name)).toContain("fractal-tools");
		expect(agent?.extensions.map((e) => e.name)).not.toContain("fractal-bot");
		await expect(createSession(h, null, FAUX, { botId: 'bot_missing' })).rejects.toThrow(/No such bot/);
	});
});
