import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { existsSync, statSync } from 'node:fs';
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
	type ProjectMeta,
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
			? clone({ sessions: value.sessions ?? {}, projects: value.projects ?? {} })
			: { sessions: {}, projects: {} }
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
				seeds.push([String(r.id), { ...freshSession(null, 0, fallback.provider, fallback.modelId), title, createdAt: 0, updatedAt: 0 }]);
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
 * Create a conversation and pin its project. The `conversationCreated` hook
 * seeds the index entry first; this overwrites it with the real project, which
 * is race-free where a pending-project flag would not be.
 */
export async function createSession(
	h: Harness,
	projectId: string | null,
	model: ModelRef,
	opts: { botId?: string } = {}
): Promise<ConversationId> {
	const bot = opts.botId ? (await h.snapshot(BotsDoc, ctx()))?.bots[opts.botId] : undefined;
	if (opts.botId && !bot) throw new Error(`No such bot: ${opts.botId}`);
	// A bot session selects the bot extension (identity, profile, memory sections and tools) and, without a
	// project, works in the bot's workspace (its botroom by default).
	const cwd = bot && !projectId ? bot.workspace : undefined;
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
			...(d.sessions[key(conv.id)] ?? freshSession(projectId, now, model.provider, model.modelId)),
			projectId,
			provider: model.provider,
			modelId: model.modelId,
			...(opts.botId ? { botId: opts.botId } : {})
		};
	}, ctx());
	return conv.id;
}

/**
 * "Move to bot": give a session (usually a detached one) to `botId`, or return it to a plain session with
 * `null`. The session keeps its transcript, project and folder; the bot's identity, profile, memory and tools
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
 * source's project and title; using either session never touches the other.
 */
export async function forkSession(
	h: Harness,
	id: ConversationId,
	at: EntryId,
	model: ModelRef,
	source: { projectId: string | null; title: string }
): Promise<ConversationId> {
	const conv = await h.conversation(id, ctx());
	if (!conv) throw new Error(`[fractalgpui] cannot branch unknown session ${String(id)}`);
	const forked = await conv.fork(at, { ownership: { kind: 'ownerless' }, agent: { model } }, ctx());
	const now = Date.now();
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		d.sessions[key(forked.id)] = {
			...(d.sessions[key(forked.id)] ?? freshSession(source.projectId, now, model.provider, model.modelId)),
			projectId: source.projectId,
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

export const moveSession = (h: Harness, id: ConversationId, projectId: string | null) =>
	mutateSession(h, id, (m) => (m ? { ...m, projectId } : undefined));
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
		if (!d.sessions[key(id)]) d.sessions[key(id)] = freshSession(null, Date.now(), fallback.provider, fallback.modelId);
	}, ctx());
}
// --- projects ---------------------------------------------------------------

/** A project's id is its absolute folder path; the display name defaults to the base name. */
export function projectDisplayName(path: string): string {
	const base = path.replace(/\/+$/, '').split('/').pop() || path;
	return base || path;
}

async function mutateProject(
	h: Harness,
	id: string,
	fn: (meta: ProjectMeta | undefined) => ProjectMeta | undefined
): Promise<void> {
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		const cur = d.projects[id];
		const next = fn(cur ? clone(cur) : undefined);
		if (next) d.projects[id] = next;
		else delete d.projects[id];
	}, ctx());
}

/**
 * Add a project by absolute folder path (§1.19). Throws with the reason when
 * the path is missing, relative, absent, or not a directory. Re-adding an
 * existing project returns its id instead of duplicating it. Never writes
 * into the folder itself.
 */
export async function addProject(h: Harness, path: string): Promise<string> {
	const raw = path.trim();
	if (!raw) throw new Error('Enter a folder path.');
	const clean = raw.replace(/\/+$/, '') || '/';
	if (!clean.startsWith('/')) throw new Error(`Not an absolute path: ${clean}`);
	let isDir = false;
	try {
		isDir = statSync(clean).isDirectory();
	} catch {
		isDir = false;
	}
	if (!existsSync(clean) || !isDir) {
		if (!existsSync(clean)) throw new Error(`No such folder: ${clean}`);
		throw new Error(`Not a folder: ${clean}`);
	}
	const snap = await h.snapshot(SessionsDoc, ctx());
	if (snap?.projects[clean]) return clean;
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		if (!d.projects[clean]) d.projects[clean] = { path: clean, name: projectDisplayName(clean), pinned: false, archived: false };
	}, ctx());
	return clean;
}

/** Rename edits the display name only, never the path. Empty names are rejected. */
export async function renameProject(h: Harness, id: string, name: string): Promise<boolean> {
	const clean = name.trim();
	if (!clean) return false;
	await mutateProject(h, id, (m) => (m ? { ...m, name: clean } : undefined));
	return true;
}

export const setProjectPinned = (h: Harness, id: string, pinned: boolean) =>
	mutateProject(h, id, (m) => (m ? { ...m, pinned } : undefined));

export const setProjectArchived = (h: Harness, id: string, archived: boolean) =>
	mutateProject(h, id, (m) => (m ? { ...m, archived } : undefined));

/**
 * Delete the project entry only (§1.13): its sessions survive with their
 * project cleared, so they move to the Sessions group. Never deletes files.
 */
export async function removeProject(h: Harness, id: string): Promise<void> {
	await h.commit(async (tx) => {
		const d: Draft<SessionsIndex> = await tx.doc(SessionsDoc);
		delete d.projects[id];
		for (const sid of Object.keys(d.sessions)) {
			if (d.sessions[sid]?.projectId === id) d.sessions[sid] = { ...clone(d.sessions[sid]), projectId: null };
		}
	}, ctx());
}
