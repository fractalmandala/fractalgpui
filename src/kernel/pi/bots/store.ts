import { rmSync, statSync } from 'node:fs';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Draft } from '@earendil-works/chord';
import type { Harness, ConversationId } from '@earendil-works/pi-durable';
import { SessionsDoc, type SessionsIndex } from '../metadata.ts';
import { AuditLog } from '../audit.ts';
import { data_dir } from '../../paths.ts';
import {
	assertValid,
	BotsDoc,
	DEFAULT_CAPABILITIES,
	DEFAULT_CHARACTER,
	DEFAULT_MEMORY,
	DEFAULT_MISSION,
	DEFAULT_ROLE,
	BOT_SCHEMA_VERSION,
	diffValues,
	newBotId,
	upgradeBot,
	type Actor,
	type BotMeta,
	type BotsIndex,
	type Capabilities,
	type Character,
	type DiffEntry,
	type Identity,
	type MemoryConfig,
	type NewBotInput
} from './meta.ts';
import { botPaths, createBotroom, ensureBotFolders } from './paths.ts';
import { botExtensionOff } from './extension.ts';

const ctx = () => BACKGROUND_CONTEXT;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Optional `root` = data dir override (tests). Everything else is the durable `fractal.bots` document. */
export interface StoreOptions {
	root?: string;
	now?: () => number;
}
const nowOf = (o?: StoreOptions) => (o?.now ?? Date.now)();
const rootOf = (o?: StoreOptions) => o?.root ?? data_dir();

/** The editable part of a bot, applied as one explicit save. The identity is NOT here: it is locked. */
export type BotPatch = {
	character?: Partial<Character>;
	capabilities?: Partial<Capabilities>;
	memory?: Partial<MemoryConfig>;
	/** Path of an avatar image; `null` removes it (back to the generated fallback). */
	avatar?: string | null;
	roles?: string[];
	/** Enabled plugin ids. */
	plugins?: string[];
	/** Assign a folder; `null` returns to the bot's botroom folder. */
	workspace?: string | null;
	archived?: boolean;
};
const PATCH_KEYS = new Set(['character', 'capabilities', 'memory', 'avatar', 'roles', 'plugins', 'workspace', 'archived']);

export type SaveResult = { bot: BotMeta; diff: DiffEntry[] };

async function snapshot(h: Harness): Promise<BotsIndex> {
	return (await h.snapshot(BotsDoc, ctx())) ?? { bots: {} };
}

export async function ensureBotsDoc(h: Harness): Promise<void> {
	await h.commit(async (tx) => {
		await tx.doc(BotsDoc);
	}, ctx());
}

export async function listBots(h: Harness): Promise<{ id: string; bot: BotMeta }[]> {
	const snap = await snapshot(h);
	return Object.entries(snap.bots)
		.map(([id, bot]) => ({ id, bot: upgradeBot(clone(bot)) }))
		.sort((a, b) => b.bot.updatedAt - a.bot.updatedAt || (a.id < b.id ? -1 : 1));
}

export async function getBot(h: Harness, id: string): Promise<BotMeta | undefined> {
	const b = (await snapshot(h)).bots[id];
	return b ? upgradeBot(clone(b)) : undefined;
}

function audit(id: string, o: StoreOptions | undefined, tool: string, summary: string, actor: Actor = 'user') {
	try {
		new AuditLog(botPaths(id, rootOf(o)).audit).append({ phase: 'after', tool, callId: `store-${Date.now()}`, summary, note: `by ${actor}`, ok: true });
	} catch {
		/* the audit folder is best effort for user-side edits; agent actions audit via the tool hooks */
	}
}

/** Create a bot: durable row, folders, and a botroom workspace unless one is assigned. */
export async function createBot(h: Harness, input: NewBotInput, o?: StoreOptions): Promise<string> {
	const name = input.name.trim();
	if (!name) throw new Error('A bot needs a name.');
	const id = newBotId();
	const now = nowOf(o);
	const root = rootOf(o);
	const assigned = input.workspace?.trim();
	if (assigned && !statSync(assigned, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`No such folder: ${assigned}`);
	const bot: BotMeta = {
		schema: BOT_SCHEMA_VERSION,
		identity: { name, role: input.role?.trim() || DEFAULT_ROLE, mission: input.mission?.trim() || DEFAULT_MISSION, createdAt: now },
		character: { ...DEFAULT_CHARACTER(), ...input.character },
		capabilities: { ...DEFAULT_CAPABILITIES(), ...input.capabilities },
		memory: { ...DEFAULT_MEMORY(), ...input.memory },
		profile: { entries: [], proposals: [], nextId: 1 },
		...(input.avatar ? { avatar: input.avatar } : {}),
		roles: input.roles ?? [],
		workspace: assigned || '/',
		workspaceIsBotroom: !assigned,
		createdAt: now,
		updatedAt: now,
		archived: false
	};
	// Validate with a stand-in workspace, then create folders only for a valid bot.
	assertValid({ ...bot, workspace: assigned || '/' });
	ensureBotFolders(id, root);
	if (!assigned) bot.workspace = createBotroom(id, name, root);
	await h.commit(async (tx) => {
		const d: Draft<BotsIndex> = await tx.doc(BotsDoc);
		d.bots[id] = bot;
	}, ctx());
	audit(id, o, 'bot_create', `created ${name}`);
	return id;
}

function applyPatch(cur: BotMeta, patch: BotPatch, root: string, id: string): BotMeta {
	const next = clone(cur);
	if (patch.character) next.character = { ...next.character, ...patch.character };
	if (patch.capabilities) next.capabilities = { ...next.capabilities, ...patch.capabilities };
	if (patch.memory) next.memory = { ...next.memory, ...patch.memory };
	if (patch.roles) next.roles = [...patch.roles];
	if (patch.plugins) next.plugins = [...patch.plugins];
	if (patch.archived !== undefined) next.archived = patch.archived;
	if (patch.avatar === null) delete next.avatar;
	else if (patch.avatar !== undefined) next.avatar = patch.avatar;
	if (patch.workspace === null) {
		// back to a botroom: reuse the existing one if it is already the workspace
		if (!next.workspaceIsBotroom) next.workspace = createBotroom(id, next.identity.name, root);
		next.workspaceIsBotroom = true;
	} else if (patch.workspace !== undefined) {
		const dir = patch.workspace.trim();
		if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`No such folder: ${dir}`);
		next.workspace = dir;
		next.workspaceIsBotroom = false;
	}
	return next;
}

/**
 * Explicit save: apply `patch`, validate the whole bot, write once, and return the diff
 * (also what the UI shows before confirming — pass `dryRun` to compute it without writing).
 * An identity key in the patch is refused: the identity is locked (use `setIdentity`).
 */
export async function updateBot(h: Harness, id: string, patch: BotPatch, o?: StoreOptions & { dryRun?: boolean; actor?: Actor }): Promise<SaveResult> {
	for (const k of Object.keys(patch)) {
		if (k === 'identity' || k === 'name' || k === 'role' || k === 'mission') throw new Error('The identity is locked after creation; use setIdentity with an explicit confirmation.');
		if (!PATCH_KEYS.has(k)) throw new Error(`Unknown bot field: ${k}`);
	}
	const cur = await getBot(h, id);
	if (!cur) throw new Error(`No such bot: ${id}`);
	const next = applyPatch(cur, patch, rootOf(o), id);
	assertValid(next);
	const diff = diffValues(cur, next).filter((d) => d.path !== 'updatedAt');
	if (!diff.length || o?.dryRun) return { bot: o?.dryRun ? next : cur, diff };
	next.updatedAt = nowOf(o);
	await h.commit(async (tx) => {
		const d: Draft<BotsIndex> = await tx.doc(BotsDoc);
		if (!d.bots[id]) throw new Error(`No such bot: ${id}`);
		d.bots[id] = next;
	}, ctx());
	audit(id, o, 'bot_update', diff.map((x) => x.path).join(', '), o?.actor ?? 'user');
	return { bot: next, diff };
}

/** The only way to change an identity: an explicit user action (`confirm: true`), audited. */
export async function setIdentity(h: Harness, id: string, patch: Partial<Omit<Identity, 'createdAt'>>, confirm: boolean, o?: StoreOptions): Promise<SaveResult> {
	if (!confirm) throw new Error('The identity is locked after creation; changing it needs an explicit confirmation.');
	const cur = await getBot(h, id);
	if (!cur) throw new Error(`No such bot: ${id}`);
	const next = clone(cur);
	for (const k of ['name', 'role', 'mission'] as const) if (patch[k] !== undefined) next.identity[k] = patch[k].trim();
	assertValid(next);
	const diff = diffValues(cur, next);
	if (!diff.length) return { bot: cur, diff };
	next.updatedAt = nowOf(o);
	await h.commit(async (tx) => {
		const d: Draft<BotsIndex> = await tx.doc(BotsDoc);
		d.bots[id] = next;
	}, ctx());
	audit(id, o, 'identity', `identity ${next.identity.name}`);
	return { bot: next, diff };
}

/** A copy of the bot's setup (character, capabilities, memory posture, profile, roles). No sessions, memory or audit are copied. */
export async function duplicateBot(h: Harness, id: string, name?: string, o?: StoreOptions): Promise<string> {
	const src = await getBot(h, id);
	if (!src) throw new Error(`No such bot: ${id}`);
	const copyName = (name ?? `${src.identity.name} copy`).trim().slice(0, 40);
	const newId = await createBot(
		h,
		{
			name: copyName,
			role: src.identity.role,
			mission: src.identity.mission,
			character: src.character,
			capabilities: src.capabilities,
			memory: src.memory,
			roles: src.roles,
			...(src.avatar ? { avatar: src.avatar } : {}),
			...(src.workspaceIsBotroom ? {} : { workspace: src.workspace })
		},
		o
	);
	await h.commit(async (tx) => {
		const d: Draft<BotsIndex> = await tx.doc(BotsDoc);
		if (d.bots[newId]) d.bots[newId] = { ...clone(d.bots[newId]), profile: clone(src.profile) };
	}, ctx());
	return newId;
}

export type DeleteResult = { detached: string[] };

/**
 * Delete a bot. Its sessions are KEPT and detached (botId cleared, they become plain sessions).
 * The botroom folder is never deleted. The bot's home folder (audit, memory, browser profile, media)
 * stays on disk unless `removeHome` is set.
 */
export async function deleteBot(h: Harness, id: string, o?: StoreOptions & { removeHome?: boolean }): Promise<DeleteResult> {
	const detached: string[] = [];
	await h.commit(async (tx) => {
		const d: Draft<BotsIndex> = await tx.doc(BotsDoc);
		if (!d.bots[id]) throw new Error(`No such bot: ${id}`);
		const s: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		for (const sid of Object.keys(s.sessions)) {
			const m = s.sessions[sid];
			if (m && m.botId === id) {
				const next = { ...clone(m) };
				delete next.botId;
				s.sessions[sid] = next;
				detached.push(sid);
			}
		}
		delete d.bots[id];
	}, ctx());
	// Stop offering bot tools in the detached sessions (best effort: the policy also refuses them without a bot).
	
	for (const sid of detached) await botExtensionOff(h, Number(sid) as ConversationId).catch(() => {});
	if (o?.removeHome) rmSync(botPaths(id, rootOf(o)).home, { recursive: true, force: true });
	return { detached };
}

/** Mirror the bots document into the UI: calls `onBots` now and on every change. Returns a stop function. */
export async function watchBots(h: Harness, onBots: (index: BotsIndex) => void): Promise<() => void> {
	await ensureBotsDoc(h);
	const watch = await h.watchDoc(BotsDoc, ctx());
	if (!watch) {
		onBots(clone(await snapshot(h)));
		return () => {};
	}
	await watch.start(async (value) => onBots(clone({ bots: value?.bots ?? {} })));
	onBots(clone({ bots: watch.value?.bots ?? {} }));
	let stopped = false;
	return () => {
		if (!stopped) {
			stopped = true;
			void watch.stop();
		}
	};
}
