import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Draft } from '@earendil-works/chord';
import type {
	ConversationId,
	Cursor,
	DocumentWatch,
	EntryId,
	EntryRecord,
	Harness,
	Page
} from '@earendil-works/pi-durable';
import {
	DEFAULT_TITLE,
	deriveTitle,
	freshSession,
	SessionsDoc,
	type SessionsIndex,
	type SessionMeta
} from './metadata.ts';
import { projectEntries } from './project.ts';
import { BotsDoc } from './bots/meta.ts';
import { botExtensionOff } from './bots/extension.ts';
import { BOT_EXTENSIONS } from './tools.ts';

const ctx = () => BACKGROUND_CONTEXT;
const key = (id: ConversationId) => String(id);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export interface ModelRef {
	provider: string;
	modelId: string;
}

/**
 * The session store's durable operations, with no UI framework in them so
 * `bun test` can drive them against a real harness. `sessions.svelte.ts` is the
 * thin reactive shell over these (`$state` mirror + drafts).
 */

/** Mirror the index document into the UI, detached from Chord proxies. */
function applySnapshot(value: Readonly<SessionsIndex> | null, onIndex: (index: SessionsIndex) => void) {
	onIndex(
		value
			? clone({ sessions: value.sessions ?? {} })
			: { sessions: {} }
	);
}

/**
 * Make sure the index document exists, backfill conversations that predate it,
 * then subscribe. Returns a stop function for the watch.
 */
export async function ensureIndex(h: Harness, onIndex: (index: SessionsIndex) => void, fallback: ModelRef): Promise<() => void> {
	await h.commit(async (tx) => {
		await tx.doc(SessionsDoc);
		await tx.doc(BotsDoc);
	}, ctx());
	await dropLegacyProjects(h);
	await backfillSessions(h, fallback);
	const watch: DocumentWatch<SessionsIndex> | undefined = await h.watchDoc(SessionsDoc, ctx());
	if (!watch) {
		const snap = await h.snapshot(SessionsDoc, ctx());
		applySnapshot(snap ?? null, onIndex);
		return () => {};
	}
	await watch.start(async (value) => {
		applySnapshot(value, onIndex);
	});
	applySnapshot(watch.value, onIndex);
	let stopped = false;
	return () => {
		if (!stopped) {
			stopped = true;
			void watch.stop();
		}
	};
}

/** Seed index entries for stored conversations the index has never seen. */
export async function backfillSessions(h: Harness, fallback: ModelRef): Promise<void> {
	const snap = await h.snapshot(SessionsDoc, ctx());
	const have = new Set(Object.keys(snap?.sessions ?? {}));
	let cursor: Cursor | undefined = undefined;
	for (;;) {
		const page: Page<import('@earendil-works/pi-durable').ConversationRecord, Cursor> = await h.commit((tx) =>
			tx.scanConversations({}, 100, cursor),
			ctx()
		);
		const missing = page.items.filter((r) => !have.has(String(r.id)));
		if (missing.length) {
			const seeds: [string, SessionMeta][] = [];
			for (const r of missing) {
				const text = await firstUserText(h, r.id);
				const title = (text && deriveTitle([text])) || DEFAULT_TITLE;
				seeds.push([String(r.id), { ...freshSession(0, fallback.provider, fallback.modelId), title, createdAt: 0, updatedAt: 0 }]);
			}
			await h.commit(async (tx) => {
				const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
				for (const [k, meta] of seeds) if (!d.sessions[k]) d.sessions[k] = meta;
			}, ctx());
			for (const [k] of seeds) have.add(k);
		}
		cursor = page.next;
		if (!cursor) break;
	}
}

/** Oldest user text of a conversation (scans are newest-first), or null. */
export async function firstUserText(h: Harness, id: ConversationId): Promise<string | null> {
	let cursor: Cursor | undefined = undefined;
	let first: string | null = null;
	for (;;) {
		const page: Page<EntryRecord, Cursor> = await h.commit((tx) => tx.scanEntries({ conversationId: id }, 200, cursor), ctx());
		for (const row of projectEntries(page.items, undefined)) {
			if (row.kind === 'user') first = row.text;
		}
		cursor = page.next;
		if (!cursor) break;
	}
	return first;
}

async function mutateSession(
	h: Harness,
	id: ConversationId,
	fn: (meta: SessionMeta | undefined) => SessionMeta | undefined
): Promise<void> {
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		const next = fn(d.sessions[key(id)] ? clone(d.sessions[key(id)]) : undefined);
		if (next) d.sessions[key(id)] = next;
		else delete d.sessions[key(id)];
	}, ctx());
}

/**
 * Create a conversation. The `conversationCreated` hook seeds the index entry first; this overwrites it
 * with the real model, bot and folder, which is race-free where a pending flag would not be. A bot session
 * works in the bot's workspace; a plain session may be given a `folder`.
 */
export async function createSession(
	h: Harness,
	model: ModelRef,
	opts: { botId?: string; folder?: string } = {}
): Promise<ConversationId> {
	const bot = opts.botId ? (await h.snapshot(BotsDoc, ctx()))?.bots[opts.botId] : undefined;
	if (opts.botId && !bot) throw new Error(`No such bot: ${opts.botId}`);
	// A bot session selects the bot extension (identity, profile, memory sections and tools) and works in the
	// bot's workspace (its botroom by default).
	const cwd = bot ? bot.workspace : opts.folder;
	const conv = await h.createConversation(
		{
			ownership: { kind: 'ownerless' },
			agent: { model, ...(bot ? { extensions: BOT_EXTENSIONS } : {}), ...(cwd ? { cwd } : {}) }
		},
		ctx()
	);
	const now = Date.now();
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		d.sessions[key(conv.id)] = {
			...(d.sessions[key(conv.id)] ?? freshSession(now, model.provider, model.modelId)),
			provider: model.provider,
			modelId: model.modelId,
			...(opts.botId ? { botId: opts.botId } : {}),
			...(!bot && opts.folder ? { folder: opts.folder } : {})
		};
	}, ctx());
	return conv.id;
}

/**
 * "Move to bot": give a session (usually a detached one) to `botId`, or return it to a plain session with
 * `null`. The session keeps its transcript; the bot's identity, profile, memory and tools
 * apply from the next turn. The bot must exist.
 */
export async function assignSessionToBot(h: Harness, id: ConversationId, botId: string | null): Promise<void> {
	if (botId && !(await h.snapshot(BotsDoc, ctx()))?.bots[botId]) throw new Error(`No such bot: ${botId}`);
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		const cur = d.sessions[key(id)];
		if (!cur) throw new Error(`No such session: ${id}`);
		const next = clone(cur);
		if (botId) next.botId = botId;
		else delete next.botId;
		d.sessions[key(id)] = next;
	}, ctx());
	if (!botId) return botExtensionOff(h, id);
	const conv = await h.conversation(id, ctx());
	if (conv) await conv.configure({ extensions: BOT_EXTENSIONS }, ctx());
}

/**
 * A second session inheriting the source's history up to `at`. Keeps the
 * source's folder and title; using either session never touches the other.
 */
export async function forkSession(
	h: Harness,
	id: ConversationId,
	at: EntryId,
	model: ModelRef,
	source: { folder?: string; title: string }
): Promise<ConversationId> {
	const conv = await h.conversation(id, ctx());
	if (!conv) throw new Error(`[fractalgpui] cannot branch unknown session ${String(id)}`);
	const forked = await conv.fork(at, { ownership: { kind: 'ownerless' }, agent: { model, ...(source.folder ? { cwd: source.folder } : {}) } }, ctx());
	const now = Date.now();
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		d.sessions[key(forked.id)] = {
			...(d.sessions[key(forked.id)] ?? freshSession(now, model.provider, model.modelId)),
			...(source.folder ? { folder: source.folder } : {}),
			title: source.title,
			provider: model.provider,
			modelId: model.modelId
		};
	}, ctx());
	return forked.id;
}

/** Whitespace-only titles are rejected, the stored title unchanged. */
export async function renameSession(h: Harness, id: ConversationId, title: string): Promise<boolean> {
	const clean = title.trim();
	if (!clean) return false;
	await mutateSession(h, id, (m) => (m ? { ...m, title: clean } : undefined));
	return true;
}

export const setSessionPinned = (h: Harness, id: ConversationId, pinned: boolean) =>
	mutateSession(h, id, (m) => (m ? { ...m, pinned } : undefined));

export const setSessionArchived = (h: Harness, id: ConversationId, archived: boolean) =>
	mutateSession(h, id, (m) => (m ? { ...m, archived } : undefined));

/** Set (or clear with `null`) a plain session's working folder. */
export const setSessionFolder = (h: Harness, id: ConversationId, folder: string | null) =>
	mutateSession(h, id, (m) => {
		if (!m) return undefined;
		const next = { ...m };
		if (folder) next.folder = folder;
		else delete next.folder;
		return next;
	});
export const touchSession = (h: Harness, id: ConversationId) =>
	mutateSession(h, id, (m) => (m ? { ...m, updatedAt: Date.now() } : undefined));

/** Drop the index entry. The caller deletes the records first (fail closed). */
export const removeSession = (h: Harness, id: ConversationId) => mutateSession(h, id, () => undefined);

/**
 * Merge a partial update into an index entry. `thinkingLevel: undefined` deletes
 * the key instead of writing it — Chord strict-JSON rejects explicit `undefined`.
 */
export async function patchSession(h: Harness, id: ConversationId, patch: Partial<SessionMeta>): Promise<void> {
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		const cur = d.sessions[key(id)];
		if (!cur) return;
		const next: SessionMeta = { ...clone(cur), ...clone(patch) };
		if ('thinkingLevel' in patch && patch.thinkingLevel === undefined) delete next.thinkingLevel;
		d.sessions[key(id)] = next;
	}, ctx());
}

/** Seed the index entry when nothing seeded it (hook miss, older store). */
export async function ensureSessionMeta(h: Harness, id: ConversationId, fallback: ModelRef): Promise<void> {
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		if (!d.sessions[key(id)]) d.sessions[key(id)] = freshSession(Date.now(), fallback.provider, fallback.modelId);
	}, ctx());
}
// --- upgrade ---------------------------------------------------------------

/**
 * Older stores grouped sessions under "projects" (a folder registry). That registry is gone: a session that
 * had one keeps its folder as its own `folder`, then the registry and `projectId` fields are dropped.
 * Idempotent: a store without them is left untouched.
 */
export async function dropLegacyProjects(h: Harness): Promise<void> {
	const snap = (await h.snapshot(SessionsDoc, ctx())) as unknown as { sessions?: Record<string, Record<string, unknown>>; projects?: Record<string, { path?: string }> } | undefined;
	const legacy = Object.values(snap?.sessions ?? {}).some((s) => 'projectId' in s) || (snap && 'projects' in snap);
	if (!legacy) return;
	await h.commit(async (tx) => {
		const d = (await tx.doc(SessionsDoc)) as unknown as { sessions: Record<string, Record<string, unknown>>; projects?: Record<string, { path?: string }> };
		const projects = clone(d.projects ?? {});
		for (const sid of Object.keys(d.sessions)) {
			const cur = d.sessions[sid];
			if (!('projectId' in cur)) continue;
			const next = clone(cur);
			const path = typeof next.projectId === 'string' ? projects[next.projectId]?.path : undefined;
			delete next.projectId;
			if (path && !next.folder) next.folder = path;
			d.sessions[sid] = next;
		}
		delete d.projects;
	}, ctx());
}
