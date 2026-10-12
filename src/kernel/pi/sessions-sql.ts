import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { data_dir } from '../paths.ts';

/**
 * Below-the-API session deletion. pi-durable exposes no conversation delete, so
 * `removeSession` deletes the rows itself. One function, schema-checked, single
 * transaction, fails closed. `record_ids` and `durable_metadata` are deliberately
 * untouched: minted IDs are never reused and the sequence never goes backwards.
 */

/**
 * pi-durable's reserved root conversation (`h.root()`). fractalgpui uses it as the user's first session, and the
 * harness requires it to exist forever: its id stays claimed in `record_ids`, so a deleted row can neither be found
 * nor recreated ("ID 1 already belongs to conversation"). Deleting it therefore only clears its content.
 */
export const ROOT_CONVERSATION_ID = 1;

/** Where the durable SQLite store lives (same expression as `openHarness`). */
export const agentDbPath = () => join(data_dir(), 'pi', 'agent.sqlite');

const EXPECTED_TABLES = [
	'conversations',
	'entries',
	'tasks',
	'submissions',
	'documents',
	'document_revisions',
	'record_ids',
	'durable_metadata',
	'durable_schema'
];

/** Throws when the database does not look like a pi-durable SQLite store. */
export function checkDeleteSchema(db: DatabaseSync): void {
	const rows = db.prepare(`select name from sqlite_master where type = 'table'`).all() as {
		name: string;
	}[];
	const have = new Set(rows.map((r) => r.name));
	const missing = EXPECTED_TABLES.filter((t) => !have.has(t));
	if (missing.length) {
		throw new Error(`[fractalgpui] session delete refused: not a pi store (missing ${missing.join(', ')})`);
	}
}

export interface DeleteCounts {
	revisions: number;
	documents: number;
	entries: number;
	tasks: number;
	submissions: number;
	conversations: number;
}

const changes = (r: unknown) => Number((r as { changes: number | bigint }).changes);

/**
 * Delete every record of one conversation. Any error rolls the whole thing
 * back and the caller keeps the index entry (fail closed, never half-deleted).
 */
export function deleteConversationRecords(dbPath: string, conversationId: number): DeleteCounts {
	const db = new DatabaseSync(dbPath);
	try {
		checkDeleteSchema(db);
		db.exec('BEGIN IMMEDIATE');
		try {
			const revisions = changes(
				db
					.prepare(
						`delete from document_revisions where document_id in (select id from documents where scope_kind = 'conversation' and owner_id = ?)`
					)
					.run(conversationId)
			);
			const documents = changes(
				db.prepare(`delete from documents where scope_kind = 'conversation' and owner_id = ?`).run(conversationId)
			);
			const entries = changes(db.prepare(`delete from entries where conversation_id = ?`).run(conversationId));
			const tasks = changes(db.prepare(`delete from tasks where conversation_id = ?`).run(conversationId));
			const submissions = changes(
				db.prepare(`delete from submissions where conversation_id = ?`).run(conversationId)
			);
			// Never delete the root row (see ROOT_CONVERSATION_ID); an emptied root is a fresh empty session.
			const conversations =
				conversationId === ROOT_CONVERSATION_ID
					? 0
					: changes(db.prepare(`delete from conversations where id = ?`).run(conversationId));
			db.exec('COMMIT');
			return { revisions, documents, entries, tasks, submissions, conversations };
		} catch (err) {
			try {
				db.exec('ROLLBACK');
			} catch {
				// the rollback itself failed; the original error is what matters
			}
			throw err;
		}
	} finally {
		db.close();
	}
}

/**
 * Repair for stores where an earlier build deleted the reserved root conversation (it was listed as a session).
 * Its id stays claimed in `record_ids`, so the harness can neither find nor recreate it and every startup commit
 * fails with "ID 1 already belongs to conversation". Re-insert the bare row. Backs the file up first (once).
 * Returns true when it repaired something. No-op for fresh or healthy stores.
 */
export function repairRootConversation(dbPath: string): boolean {
	if (!existsSync(dbPath)) return false;
	const db = new DatabaseSync(dbPath);
	try {
		const tables = new Set(
			(db.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]).map((r) => r.name)
		);
		if (!tables.has('conversations') || !tables.has('record_ids')) return false;
		const claimed = db.prepare(`select record_type as t from record_ids where id = ?`).get(ROOT_CONVERSATION_ID) as
			| { t: string }
			| undefined;
		const present = db.prepare(`select id from conversations where id = ?`).get(ROOT_CONVERSATION_ID);
		if (claimed?.t !== 'conversation' || present) return false;
		try {
			db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		} catch {
			// best effort; the copy below still captures the main file
		}
		const backup = `${dbPath}.pre-root-repair`;
		if (!existsSync(backup)) copyFileSync(dbPath, backup);
		db.prepare(`insert into conversations (id, owner_conversation_id, owner_task_id, record) values (?, null, null, ?)`).run(
			ROOT_CONVERSATION_ID,
			JSON.stringify({ id: ROOT_CONVERSATION_ID })
		);
		console.warn(`[fractalgpui] restored the reserved root conversation (backup: ${backup})`);
		return true;
	} finally {
		db.close();
	}
}
