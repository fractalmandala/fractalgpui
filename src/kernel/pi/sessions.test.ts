import { describe, expect, test, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
	Harness,
	MemoryStorage,
	createRegistry,
	type ConversationId,
	type Harness as HarnessType
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import {
	classifyBucket,
	deriveTitle,
	freshSession,
	mayDeriveTitle,
	orderProjects,
	orderSessions,
	projectActivity,
	SessionsDoc,
	type SessionsIndex,
	type SessionMeta
} from './metadata.ts';
import {
	addProject,
	backfillSessions,
	createSession,
	ensureIndex,
	firstUserText,
	forkSession,
	moveSession,
	projectDisplayName,
	removeProject,
	removeSession,
	renameProject,
	renameSession,
	setProjectArchived,
	setProjectPinned,
	setSessionArchived,
	setSessionPinned,
	touchSession
} from './sessions-io.ts';
import { checkDeleteSchema, deleteConversationRecords } from './sessions-sql.ts';

const ctx = () => BACKGROUND_CONTEXT;
const FAUX = { provider: 'faux', modelId: 'faux-1' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pollUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	for (;;) {
		if (cond()) return true;
		if (Date.now() >= end) return false;
		await sleep(50);
	}
}

const meta = (over: Partial<SessionMeta> = {}): SessionMeta => ({
	title: 't',
	projectId: null,
	createdAt: 1,
	updatedAt: 1,
	pinned: false,
	archived: false,
	provider: 'faux',
	modelId: 'faux-1',
	agentType: 'build',
	access: 'supervised',
	...over
});

describe('deriveTitle', () => {
	test('short probes never qualify', () => {
		expect(deriveTitle(['hi'])).toBeNull();
		expect(deriveTitle(['are you there?'])).toBeNull();
		expect(deriveTitle(['namaste are you there?'])).toBeNull();
		expect(deriveTitle(['', '   '])).toBeNull();
		expect(deriveTitle([])).toBeNull();
	});
	test('first qualifying message wins', () => {
		expect(deriveTitle(['hi', 'please refactor thecomposer into smaller parts'])).toBe(
			'please refactor thecomposer into smaller parts'
		);
	});
	test('a 30-char message qualifies even with few words', () => {
		expect(deriveTitle(['supercalifragilisticexpialidocious'])).toBe('supercalifragilisticexpialidocious');
	});
	test('long titles truncate at 120 chars', () => {
		const long = `word ${'x '.repeat(100)}`;
		expect(deriveTitle([long])!.length).toBe(120);
	});
	test('whitespace collapses', () => {
		expect(deriveTitle(['please  fix\nthe   build now today'])).toBe('please fix the build now today');
	});
});

describe('mayDeriveTitle', () => {
	test('only default titles are derived over', () => {
		expect(mayDeriveTitle('')).toBe(true);
		expect(mayDeriveTitle('New session')).toBe(true);
		expect(mayDeriveTitle('My task')).toBe(false);
	});
});

describe('classifyBucket', () => {
	// Noon local times dodge DST edges.
	const now = new Date(2026, 9, 5, 12, 0, 0).getTime();
	const day = 86400000;
	test('today, yesterday, previous-14, older', () => {
		expect(classifyBucket(now, now)).toBe('today');
		expect(classifyBucket(now - day, now)).toBe('yesterday');
		expect(classifyBucket(now - 2 * day, now)).toBe('previous14');
		expect(classifyBucket(now - 14 * day, now)).toBe('previous14');
		expect(classifyBucket(now - 15 * day, now)).toBe('older');
		expect(classifyBucket(0, now)).toBe('older');
		expect(classifyBucket(now + 3600000, now)).toBe('today');
	});
});

describe('orderSessions', () => {
	test('pinned first, newest activity first, id tie-break', () => {
		const views = [
			{ id: 'b', meta: meta({ updatedAt: 30 }) },
			{ id: 'a', meta: meta({ updatedAt: 10, pinned: true }) },
			{ id: 'c', meta: meta({ updatedAt: 20, pinned: true }) },
			{ id: 'd', meta: meta({ updatedAt: 30 }) }
		];
		expect(orderSessions(views).map((v) => v.id)).toEqual(['c', 'a', 'b', 'd']);
	});
});

describe('orderProjects + projectActivity', () => {
	test('pinned first, then by newest session activity; archived sessions excluded', () => {
		const sessions = [
			{ id: 's1', meta: meta({ projectId: 'p1', updatedAt: 50 }) },
			{ id: 's2', meta: meta({ projectId: 'p1', updatedAt: 90, archived: true }) },
			{ id: 's3', meta: meta({ projectId: 'p2', updatedAt: 70 }) }
		];
		expect(projectActivity('p1', sessions)).toBe(50);
		expect(projectActivity('p3', sessions)).toBe(0);
		const views = [
			{ id: 'p1', meta: { path: '/a', name: 'a', pinned: false, archived: false }, activity: 50 },
			{ id: 'p2', meta: { path: '/b', name: 'b', pinned: true, archived: false }, activity: 70 }
		];
		expect(orderProjects(views).map((v) => v.id)).toEqual(['p2', 'p1']);
	});
});

describe('freshSession', () => {
	test('defaults: build access supervised, no project', () => {
		const s = freshSession(null, 123, 'faux', 'faux-1');
		expect(s.title).toBe('New session');
		expect(s.agentType).toBe('build');
		expect(s.access).toBe('supervised');
		expect(s.createdAt).toBe(123);
		expect(s.provider).toBe('faux');
		expect(s.modelId).toBe('faux-1');
	});
});

// --- durable-backed io tests (MemoryStorage, faux provider) -----------------

const models = createModels();
const faux = fauxProvider();
models.setProvider(faux.provider);

let harness: HarnessType | null = null;
async function testHarness(): Promise<HarnessType> {
	if (!harness) {
		harness = await Harness.open(new MemoryStorage(), { models, registry: createRegistry() }, ctx());
		harness.resume();
	}
	return harness;
}

const snapshotSessions = async (h: HarnessType) => (await h.snapshot(SessionsDoc, ctx()))?.sessions ?? {};

describe('sessions-io against a real harness', () => {
	test('create seeds the index with the project', async () => {
		const h = await testHarness();
		const id = await createSession(h, 'p1', FAUX);
		const sessions = await snapshotSessions(h);
		expect(sessions[String(id)].projectId).toBe('p1');
		expect(sessions[String(id)].title).toBe('New session');
	});

	test('rename, pin, archive, move, touch round-trip', async () => {
		const h = await testHarness();
		const id = await createSession(h, null, FAUX);
		const k = String(id);
		expect(await renameSession(h, id, '  ')).toBe(false);
		expect(await renameSession(h, id, 'Capital work')).toBe(true);
		await setSessionPinned(h, id, true);
		await moveSession(h, id, 'p9');
		await touchSession(h, id);
		await setSessionArchived(h, id, true);
		const m = (await snapshotSessions(h))[k];
		expect(m.title).toBe('Capital work');
		expect(m.pinned).toBe(true);
		expect(m.projectId).toBe('p9');
		expect(m.archived).toBe(true);
		expect(m.updatedAt).toBeGreaterThan(0);
		await setSessionArchived(h, id, false);
	});

	test('backfill derives the title from the oldest user message', async () => {
		const h = await testHarness();
		const id = await createSession(h, null, FAUX);
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([fauxAssistantMessage('Paris.')]);
		const sub = await conv.submit({ type: 'input', content: 'What is the capital city of France today' }, ctx());
		const settled = await sub.wait(ctx());
		expect(settled.status).toBe('done');
		expect(await firstUserText(h, id)).toBe('What is the capital city of France today');
		// Wipe the index, then backfill must restore it with the derived title.
		await h.commit(async (tx) => {
			await tx.retireDoc(SessionsDoc);
		}, ctx());
		await backfillSessions(h, FAUX);
		const m = (await snapshotSessions(h))[String(id)];
		expect(m.title).toBe('What is the capital city of France today');
	});

	test('fork keeps project and title and inherits history', async () => {
		const h = await testHarness();
		const id = await createSession(h, 'p2', FAUX);
		const conv = await h.conversation(id, ctx());
		if (!conv) throw new Error('conversation missing');
		faux.setResponses([fauxAssistantMessage('ok')]);
		const sub = await conv.submit({ type: 'input', content: 'Please summarise the quarterly planning notes' }, ctx());
		expect((await sub.wait(ctx())).status).toBe('done');
		const entries = await conv.entries({}, 10, undefined, ctx());
		const at = [...entries.items].reverse().find((e) => e.kind === 'pi.user')?.id ?? entries.items[entries.items.length - 1].id;
		await renameSession(h, id, 'Source task');
		const forked = await forkSession(h, id, at, FAUX, { projectId: 'p2', title: 'Source task' });
		expect(String(forked)).not.toBe(String(id));
		const m = (await snapshotSessions(h))[String(forked)];
		expect(m.projectId).toBe('p2');
		expect(m.title).toBe('Source task');
		const forkConv = await h.conversation(forked, ctx());
		if (!forkConv) throw new Error('fork missing');
		const forkEntries = await forkConv.entries({}, 10, undefined, ctx());
		expect(forkEntries.items.length).toBeGreaterThan(0);
	});

	test('removeSession drops the index entry', async () => {
		const h = await testHarness();
		const { removeSession } = await import('./sessions-io.ts');
		const id = await createSession(h, null, FAUX);
		await removeSession(h, id);
		expect((await snapshotSessions(h))[String(id)]).toBeUndefined();
	});

	test('ensureIndex mirrors live commits and goes quiet after stop', async () => {
		const h = await testHarness();
		const seen: SessionsIndex[] = [];
		const stop = await ensureIndex(h, (next) => {
			seen.push(next);
		}, FAUX);
		// Created after subscribing: the watch must deliver it without a re-read.
		const id = await createSession(h, null, FAUX);
		const k = String(id);
		expect(await pollUntil(() => seen.some((ix) => ix.sessions[k]?.title === 'New session'), 3000)).toBe(true);
		await renameSession(h, id, 'Live title');
		expect(await pollUntil(() => seen.some((ix) => ix.sessions[k]?.title === 'Live title'), 3000)).toBe(true);
		stop();
		await renameSession(h, id, 'After stop');
		await sleep(300);
		expect(seen[seen.length - 1].sessions[k]?.title).toBe('Live title');
	});
});

describe('project operations', () => {
	test('addProject validates the path and names from the base', async () => {
		const h = await testHarness();
		const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-proj-'));
		const file = join(dir, 'note.txt');
		writeFileSync(file, 'x');
		await expect(addProject(h, '')).rejects.toThrow('Enter a folder path');
		await expect(addProject(h, 'relative/path')).rejects.toThrow('Not an absolute path');
		await expect(addProject(h, join(dir, 'missing'))).rejects.toThrow('No such folder');
		await expect(addProject(h, file)).rejects.toThrow('Not a folder');
		const id = await addProject(h, dir);
		expect(id).toBe(dir);
		const snap = await h.snapshot(SessionsDoc, ctx());
		expect(snap?.projects[dir]?.name).toBe(projectDisplayName(dir));
		expect(snap?.projects[dir]?.pinned).toBe(false);
		// Re-adding selects instead of duplicating.
		expect(await addProject(h, `${dir}/`)).toBe(dir);
	});

	test('rename/pin/archive round-trip; empty rename rejected', async () => {
		const h = await testHarness();
		const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-proj-'));
		await addProject(h, dir);
		expect(await renameProject(h, dir, '  ')).toBe(false);
		expect(await renameProject(h, dir, 'My Project')).toBe(true);
		await setProjectPinned(h, dir, true);
		await setProjectArchived(h, dir, true);
		const snap = await h.snapshot(SessionsDoc, ctx());
		expect(snap?.projects[dir]?.name).toBe('My Project');
		expect(snap?.projects[dir]?.pinned).toBe(true);
		expect(snap?.projects[dir]?.archived).toBe(true);
	});

	test('removeProject drops the entry and frees its sessions', async () => {
		const h = await testHarness();
		const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-proj-'));
		await addProject(h, dir);
		const id = await createSession(h, dir, FAUX);
		await removeProject(h, dir);
		const snap = await h.snapshot(SessionsDoc, ctx());
		expect(snap?.projects[dir]).toBeUndefined();
		expect(snap?.sessions[String(id)]?.projectId).toBeNull();
	});
});

// --- below-the-API SQL delete, against a real-schema temp file --------------

const tmpDir = mkdtempSync(join(tmpdir(), 'fractalgpui-sessions-sql-'));
afterAll(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

async function seedStore(path: string) {
	const storage = await openNodeSqliteStorage(path);
	const db = new DatabaseSync(path);
	const run = (sql: string, ...params: (number | string | null)[]) => db.prepare(sql).run(...params);
	run(`insert into conversations (id, owner_conversation_id, owner_task_id, record) values (1, null, null, '{}')`);
	run(`insert into conversations (id, owner_conversation_id, owner_task_id, record) values (2, null, null, '{}')`);
	run(`insert into entries (id, conversation_id, head, commit_seq, record) values (10, 1, null, 1, '{}')`);
	run(`insert into entries (id, conversation_id, head, commit_seq, record) values (11, 2, null, 1, '{}')`);
	run(`insert into documents (id, kind, family, key_value, scope_kind, owner_id, created_at, retired_at, record)
		values (20, 'pi.live', 0, '', 'conversation', 1, 1, null, '{}')`);
	run(`insert into documents (id, kind, family, key_value, scope_kind, owner_id, created_at, retired_at, record)
		values (21, 'pi.live', 0, '', 'conversation', 2, 1, null, '{}')`);
	run(`insert into documents (id, kind, family, key_value, scope_kind, owner_id, created_at, retired_at, record)
		values (22, 'fractal.sessions', 0, '', 'session', 0, 1, null, '{}')`);
	run(`insert into document_revisions (document_id, seq, kind, version, content) values (20, 1, 'base', 1, '{}')`);
	run(`insert into document_revisions (document_id, seq, kind, version, content) values (21, 1, 'base', 1, '{}')`);
	run(`insert into document_revisions (document_id, seq, kind, version, content) values (22, 1, 'base', 1, '{}')`);
	run(`insert into tasks (id, conversation_id, kind, status, abort_requested, background, record)
		values (30, 1, 'run', 'terminal', 0, 0, '{}')`);
	run(`insert into tasks (id, conversation_id, kind, status, abort_requested, background, record)
		values (31, 2, 'run', 'terminal', 0, 0, '{}')`);
	run(`insert into submissions (id, conversation_id, request_id, status, record) values (40, 1, null, 'done', '{}')`);
	run(`insert into submissions (id, conversation_id, request_id, status, record) values (41, 2, null, 'done', '{}')`);
	db.close();
	return storage;
}

const count = (db: DatabaseSync, sql: string, ...params: (number | string)[]) =>
	(db.prepare(sql).get(...params) as { n: number }).n;

describe('deleteConversationRecords', () => {
	test('refuses a database without the pi schema', () => {
		const db = new DatabaseSync(':memory:');
		expect(() => checkDeleteSchema(db)).toThrow('not a pi store');
		db.close();
	});

	test('deletes one conversation and keeps the other plus session docs', async () => {
		const path = join(tmpDir, 'agent.sqlite');
		await seedStore(path);
		const counts = deleteConversationRecords(path, 1);
		expect(counts).toEqual({ revisions: 1, documents: 1, entries: 1, tasks: 1, submissions: 1, conversations: 1 });
		const db = new DatabaseSync(path);
		try {
			expect(count(db, `select count(*) as n from conversations where id = 2`)).toBe(1);
			expect(count(db, `select count(*) as n from entries where conversation_id = 2`)).toBe(1);
			expect(count(db, `select count(*) as n from documents where owner_id = 2`)).toBe(1);
			expect(count(db, `select count(*) as n from document_revisions where document_id = 21`)).toBe(1);
			expect(count(db, `select count(*) as n from tasks where conversation_id = 2`)).toBe(1);
			expect(count(db, `select count(*) as n from submissions where conversation_id = 2`)).toBe(1);
			expect(count(db, `select count(*) as n from documents where kind = 'fractal.sessions'`)).toBe(1);
			expect(count(db, `select count(*) as n from conversations where id = 1`)).toBe(0);
			expect(count(db, `select count(*) as n from entries where conversation_id = 1`)).toBe(0);
		} finally {
			db.close();
		}
	});

	test('deleting an unknown id removes nothing and does not throw', async () => {
		const path = join(tmpDir, 'agent2.sqlite');
		await seedStore(path);
		expect(deleteConversationRecords(path, 999).conversations).toBe(0);
		const db = new DatabaseSync(path);
		try {
			expect(count(db, `select count(*) as n from conversations`)).toBe(2);
		} finally {
			db.close();
		}
	});
});
