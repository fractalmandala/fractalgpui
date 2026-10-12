import { openHarness, piModels } from './harness.svelte.ts';
import { isTestEnv, resolveDefault } from './models.ts';
import {
	backfillSessions,
	createSession as ioCreate,
	ensureIndex as ioEnsure,
	forkSession as ioFork,
	setSessionFolder as ioFolder,
	assignSessionToBot as ioAssign,
	removeSession as ioRemove,
	renameSession as ioRename,
	setSessionArchived as ioArchive,
	setSessionPinned as ioPin,
	touchSession as ioTouch,
	type ModelRef
} from './sessions-io.ts';
import { agentDbPath, deleteConversationRecords } from './sessions-sql.ts';
import type { EntryId, Harness } from '@earendil-works/pi-durable';
import type { ConversationId } from '@earendil-works/pi-durable';
import type { SessionsIndex } from './metadata.ts';
import type { BotsIndex } from './bots/meta.ts';
import { watchBots } from './bots/store.ts';

/**
 * The session store's reactive shell. All durable logic lives in
 * `sessions-io.ts` (testable under `bun test`); this module holds the `$state`
 * mirror, the memory-only drafts (§2.8: never written to storage), and the
 * open-harness wiring. Selection and active sessions arrive in Slice 2.
 */

export const index = $state<SessionsIndex>({ sessions: {} });

/** Mirror of the `fractal.bots` document (read-only here; edits go through the bot store). */
export const botIndex = $state<BotsIndex>({ bots: {} });

/** Unsent composer text per session id. Memory only — lost on restart, by spec. */
export const drafts = $state<Record<string, string>>({});

let opening: Promise<void> | null = null;

async function harness(): Promise<Harness> {
	if (!opening) {
		opening = (async () => {
			const h = await openHarness();
			await ioEnsure(h, (next) => {
				index.sessions = next.sessions;
			}, resolveDefault(piModels()));
			await watchBots(h, (next) => {
				botIndex.bots = next.bots;
			});
		})();
	}
	await opening;
	return openHarness();
}

/** The open harness, for the bot store (create / save / delete take it directly). */
export const sessionHarness = harness;

export const ensureSessions = () => harness().then(() => {});

export const sessionMeta = (id: ConversationId | string) => index.sessions[String(id)];

/**
 * The folder a session's file and shell tools work in: its bot's workspace (botroom unless assigned), or the
 * folder chosen for a plain session. Undefined when there is none.
 */
export function sessionWorkspace(id: ConversationId | string): string | undefined {
	const meta = index.sessions[String(id)];
	return (meta?.botId ? botIndex.bots[meta.botId]?.workspace : meta?.folder) ?? undefined;
}

export async function createSession(model: ModelRef, opts: { botId?: string; folder?: string } = {}): Promise<ConversationId> {
	return ioCreate(await harness(), model, opts);
}

export async function forkSession(
	id: ConversationId,
	at: EntryId,
	model: ModelRef,
	source: { folder?: string; title: string }
): Promise<ConversationId> {
	return ioFork(await harness(), id, at, model, source);
}

export async function renameSession(id: ConversationId, title: string): Promise<boolean> {
	return ioRename(await harness(), id, title);
}

export async function setSessionPinned(id: ConversationId, pinned: boolean): Promise<void> {
	await ioPin(await harness(), id, pinned);
}

export async function setSessionArchived(id: ConversationId, archived: boolean): Promise<void> {
	await ioArchive(await harness(), id, archived);
}

/** Set (or clear) a plain session's working folder. */
export async function setSessionFolder(id: ConversationId, folder: string | null): Promise<void> {
	await ioFolder(await harness(), id, folder);
}

/** Move a session to a bot (or `null`: back to a plain session). */
export async function assignSession(id: ConversationId, botId: string | null): Promise<void> {
	await ioAssign(await harness(), id, botId);
}

export async function touchSession(id: ConversationId): Promise<void> {
	await ioTouch(await harness(), id);
}

/**
 * Delete a session's records, then drop its index entry. SQL first so a
 * storage failure keeps the row (fail closed). In the test env there is no
 * SQLite file (MemoryStorage), so only the index entry is dropped.
 */
export async function removeSession(id: ConversationId): Promise<void> {
	const h = await harness();
	if (!isTestEnv()) deleteConversationRecords(agentDbPath(), id);
	delete drafts[String(id)];
	await ioRemove(h, id);
}
