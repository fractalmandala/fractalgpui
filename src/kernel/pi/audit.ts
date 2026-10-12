// Append-only audit log. A row is written (and fsynced) BEFORE every file/shell/browser action, and a second row
// after with the outcome. Pi Durable hooks cannot commit documents, so this lives in its own JSONL file
// (rotated; every field capped) instead of in the conversation transcript.
import { appendFileSync, closeSync, fsyncSync, openSync, renameSync, statSync, existsSync, readFileSync } from "node:fs";
import { preview } from "./caps.ts";

export interface AuditRow {
	ts: number;
	phase: "before" | "after" | "blocked" | "approval";
	tool: string;
	callId: string;
	summary: string;
	destructive?: boolean;
	approved?: boolean;
	ok?: boolean;
	note?: string;
}

const MAX_BYTES = 2_000_000;

export class AuditLog {
	readonly file: string;
	private readonly maxBytes: number;
	constructor(file: string, maxBytes = MAX_BYTES) {
		this.file = file;
		this.maxBytes = maxBytes;
	}

	append(row: Omit<AuditRow, "ts"> & { ts?: number }): void {
		const clean: AuditRow = { ...row, ts: row.ts ?? Date.now(), summary: preview(row.summary, 600), note: row.note ? preview(row.note, 300) : undefined };
		this.rotateIfNeeded();
		const fd = openSync(this.file, "a");
		try {
			appendFileSync(fd, JSON.stringify(clean) + "\n");
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
	}

	private rotateIfNeeded(): void {
		try {
			if (existsSync(this.file) && statSync(this.file).size > this.maxBytes) renameSync(this.file, this.file + ".1"); // keeps one generation
		} catch {
			/* best effort */
		}
	}

	read(): AuditRow[] {
		if (!existsSync(this.file)) return [];
		return readFileSync(this.file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditRow);
	}
}
