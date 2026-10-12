import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { data_dir } from '../paths.ts';

/**
 * Below-the-API session deletion. pi-durable exposes no conversation delete, so
 * `removeSession` deletes the rows itself. One function, schema-checked, single
 * transaction, fails closed. `record_ids` and `durable_metadata` are deliberately
 * untouched: minted IDs are never reused and the sequence never goes backwards.
 */

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
			const conversations = changes(db.prepare(`delete from conversations where id = ?`).run(conversationId));
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
