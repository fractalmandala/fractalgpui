import { openHarness } from './harness.svelte.ts';
import { isTestEnv, modelDefaults } from './models.ts';
import {
	backfillSessions,
	addProject as ioAddProject,
	createSession as ioCreate,
	ensureIndex as ioEnsure,
	forkSession as ioFork,
	moveSession as ioMove,
	assignSessionToBot as ioAssign,
	removeProject as ioRemoveProject,
	removeSession as ioRemove,
	renameProject as ioRenameProject,
	renameSession as ioRename,
	setProjectArchived as ioArchiveProject,
	setProjectPinned as ioPinProject,
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

export const index = $state<SessionsIndex>({ sessions: {}, projects: {} });

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
				index.projects = next.projects;
			}, modelDefaults);
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

export async function createSession(projectId: string | null, model: ModelRef, opts: { botId?: string } = {}): Promise<ConversationId> {
	return ioCreate(await harness(), projectId, model, opts);
}

export async function forkSession(
	id: ConversationId,
	at: EntryId,
	model: ModelRef,
	source: { projectId: string | null; title: string }
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

export async function moveSession(id: ConversationId, projectId: string | null): Promise<void> {
	await ioMove(await harness(), id, projectId);
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

export async function addProject(path: string): Promise<string> {
	return ioAddProject(await harness(), path);
}

export async function renameProject(id: string, name: string): Promise<boolean> {
	return ioRenameProject(await harness(), id, name);
}

export async function setProjectPinned(id: string, pinned: boolean): Promise<void> {
	await ioPinProject(await harness(), id, pinned);
}

export async function setProjectArchived(id: string, archived: boolean): Promise<void> {
	await ioArchiveProject(await harness(), id, archived);
}

export async function removeProject(id: string): Promise<void> {
	await ioRemoveProject(await harness(), id);
}
