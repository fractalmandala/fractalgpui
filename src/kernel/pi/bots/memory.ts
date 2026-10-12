// Temporal memory (UniiChat-style), tier 1. The repo docs only give the CONTRACT (docs/design/bot-skeleton.md):
//   request = [tools][system][view][new message];  view = constant-size map of the whole chat;
//   one short line per message/merge written by a cheap background call, stored ONCE, lossy by design;
//   zoom/date tools are the only navigation; Pi's own compaction is disabled.
// This is a sound implementation of that contract (exact design in docs/PLAN.md):
//   * every chat message becomes a LEAF node. A background summarizer (the configured model) writes ONE line (<= 512 bytes)
//     for it and the raw text is then dropped (lossy; the original stays in the chat transcript);
//   * the VIEW is the set of root nodes (nodes without a parent) in time order. When the view exceeds its character
//     budget, the oldest `fan` lowest-level roots (outside the newest `keepRecent`) are MERGED by the summarizer into one
//     coarser parent line. Old history therefore gets coarser, the view stays <= budget;
//   * zoom(id) lists a merge's children; date(day) lists what happened that day; both are bounded.
// Disk is bounded: <= maxNodes rows (oldest non-root nodes are pruned first; zooming into pruned children says so),
// raw text <= 2000 chars and only while pending, at most MAX_PENDING pending nodes.
// Without a working summarizer nothing is faked: nodes stay pending, the view shows a clipped raw excerpt flagged
// "(not summarized yet)" and `status()` carries the reason.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import type { Models } from "@earendil-works/pi-ai/models";
import type { MemoryConfig } from "./meta.ts";

export const MAX_LINE_BYTES = 512;
export const RAW_CAP = 2000;
export const MAX_PENDING = 300;
export const DEFAULT_MAX_NODES = 20_000;

export class SummarizerUnavailable extends Error {}
export type Summarize = (req: { kind: "message" | "merge"; role?: string; text: string }) => Promise<string>;

export interface MemNode {
	id: number; kind: "msg" | "merge"; level: number; tsFrom: number; tsTo: number; role: string;
	src: string | null; line: string | null; raw: string | null; parent: number | null; state: "pending" | "done" | "lost";
}
export interface ViewLine { id: number; kind: "msg" | "merge"; level: number; when: string; text: string; pending: boolean }
export interface MemoryView { text: string; lines: ViewLine[]; size: number; budget: number; omitted: number }
export interface MemoryStatus { ok: boolean; message: string; nodes: number; roots: number; pending: number; maxLevel: number; bytes: number }

export function oneLine(text: string, maxBytes = MAX_LINE_BYTES): string {
	let s = text.replace(/\s+/g, " ").trim();
	while (Buffer.byteLength(s) > maxBytes) s = s.slice(0, Math.floor(s.length * 0.9));
	return s;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayOf = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeOf = (ts: number) => { const d = new Date(ts); return `${dayOf(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export interface MemoryOptions {
	file: string;
	config: () => MemoryConfig;
	/** undefined = no summarizer wired (nodes stay pending). */
	summarize?: Summarize;
	maxNodes?: number;
	/** ms to wait after a summarizer failure before the next record() retries it (explicit retry() ignores it). */
	retryAfterMs?: number;
	onChange?: () => void;
	now?: () => number;
}

export class MemoryManager {
	private db: DatabaseSync;
	private o: MemoryOptions;
	private running: Promise<void> | undefined;
	private failure: { message: string; at: number } | undefined;

	constructor(o: MemoryOptions) {
		this.o = o;
		mkdirSync(dirname(o.file), { recursive: true });
		this.db = new DatabaseSync(o.file);
		this.db.exec(`PRAGMA journal_mode=TRUNCATE; PRAGMA synchronous=NORMAL;
			CREATE TABLE IF NOT EXISTS node (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, level INTEGER NOT NULL, ts_from INTEGER NOT NULL, ts_to INTEGER NOT NULL,
				role TEXT NOT NULL DEFAULT '', src TEXT UNIQUE, line TEXT, raw TEXT, parent INTEGER, state TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS node_parent ON node(parent); CREATE INDEX IF NOT EXISTS node_ts ON node(ts_from);`);
	}

	private now() { return this.o.now ? this.o.now() : Date.now(); }
	private notify() { try { this.o.onChange?.(); } catch { /* listener errors never break memory */ } }
	private row(r: Record<string, unknown> | undefined): MemNode | undefined {
		return r && { id: Number(r.id), kind: r.kind as MemNode["kind"], level: Number(r.level), tsFrom: Number(r.ts_from), tsTo: Number(r.ts_to), role: String(r.role), src: (r.src as string) ?? null, line: (r.line as string) ?? null, raw: (r.raw as string) ?? null, parent: r.parent === null ? null : Number(r.parent), state: r.state as MemNode["state"] };
	}
	private all(sql: string, ...a: Array<string | number | null>): MemNode[] { return this.db.prepare(sql).all(...a).map((r) => this.row(r as Record<string, unknown>)!); }
	get(id: number): MemNode | undefined { return this.row(this.db.prepare("SELECT * FROM node WHERE id=?").get(id) as Record<string, unknown> | undefined); }
	private count(sql: string, ...a: Array<string | number>): number { return Number((this.db.prepare(sql).get(...a) as { c: number }).c); }

	/** Add a chat message (idempotent per `src`). The summarizer runs in the background. */
	record(m: { src: string; role: string; text: string; ts: number }): void {
		const exists = this.db.prepare("SELECT 1 FROM node WHERE src=?").get(m.src);
		if (exists) return;
		this.db.prepare("INSERT INTO node(kind,level,ts_from,ts_to,role,src,raw,state) VALUES('msg',0,?,?,?,?,?,'pending')").run(m.ts, m.ts, m.role, m.src, m.text.slice(0, RAW_CAP));
		this.limitPending();
		this.notify();
		if (!this.failure || this.now() - this.failure.at >= (this.o.retryAfterMs ?? 10_000)) void this.drain();
	}

	private limitPending(): void {
		const over = this.count("SELECT COUNT(*) c FROM node WHERE state='pending'") - MAX_PENDING;
		if (over > 0) this.db.prepare("UPDATE node SET state='lost', raw=NULL, line='[message not summarized: the summarizer was unavailable]' WHERE id IN (SELECT id FROM node WHERE state='pending' ORDER BY ts_from LIMIT ?)").run(over);
	}

	/** Retry after a failure (UI button). */
	retry(): Promise<void> { this.failure = undefined; return this.drain(); }

	/** Process pending nodes, then merge until the view fits its budget. Single flight; resolves when idle or blocked by a failure. */
	drain(): Promise<void> {
		if (!this.running) this.running = this.loop().finally(() => { this.running = undefined; });
		return this.running;
	}
	async idle(): Promise<void> { while (this.running) await this.running; }

	private async loop(): Promise<void> {
		const summarize = this.o.summarize;
		if (!summarize) { this.failure = { message: "No summarizer is wired: memory lines are not being written.", at: this.now() }; this.notify(); return; }
		try {
			for (;;) {
				const p = this.all("SELECT * FROM node WHERE state='pending' ORDER BY ts_from, id LIMIT 1")[0];
				if (p) {
					const line = oneLine(await summarize({ kind: "message", role: p.role, text: p.raw ?? "" }));
					if (!line) throw new Error("The summarizer returned an empty line.");
					this.db.prepare("UPDATE node SET line=?, raw=NULL, state='done' WHERE id=? AND state='pending'").run(line, p.id);
					this.failure = undefined;
					this.notify();
					continue;
				}
				const group = this.mergeGroup();
				if (!group) break;
				const text = group.map((n) => `[${n.level}] ${n.line}`).join("\n");
				const line = oneLine(await summarize({ kind: "merge", text }));
				if (!line) throw new Error("The summarizer returned an empty line.");
				this.commitMerge(group, line);
				this.failure = undefined;
				this.notify();
			}
			this.prune();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.failure = { message, at: this.now() };
		}
		this.notify();
	}

	private roots(): MemNode[] { return this.all("SELECT * FROM node WHERE parent IS NULL ORDER BY ts_from, id"); }
	private rootSize(roots: MemNode[]): number { return roots.reduce((n, r) => n + (r.line ?? "").length + 40, 0); }

	/** The oldest `fan` lowest-level done roots outside the newest `keepRecent`, when the view is over budget. */
	private mergeGroup(): MemNode[] | undefined {
		const cfg = this.o.config();
		const roots = this.roots();
		if (this.rootSize(roots) <= cfg.viewBudgetChars) return undefined;
		const eligible = roots.slice(0, Math.max(0, roots.length - cfg.keepRecent)).filter((r) => r.state === "done" || r.state === "lost");
		if (eligible.length < 2) return undefined;
		const low = Math.min(...eligible.map((r) => r.level));
		let pick = eligible.filter((r) => r.level === low).slice(0, cfg.fan);
		if (pick.length < 2) pick = eligible.slice(0, cfg.fan); // too few at the lowest level: fold the oldest coarse ones together
		return pick;
	}

	private commitMerge(group: MemNode[], line: string): void {
		this.db.exec("BEGIN");
		try {
			const level = Math.max(...group.map((g) => g.level)) + 1;
			const r = this.db.prepare("INSERT INTO node(kind,level,ts_from,ts_to,role,line,state) VALUES('merge',?,?,?,'',?,'done')").run(level, Math.min(...group.map((g) => g.tsFrom)), Math.max(...group.map((g) => g.tsTo)), line);
			const id = Number(r.lastInsertRowid);
			const up = this.db.prepare("UPDATE node SET parent=? WHERE id=?");
			for (const g of group) up.run(id, g.id);
			this.db.exec("COMMIT");
		} catch (e) { this.db.exec("ROLLBACK"); throw e; }
	}

	/** Bound the rows: drop the oldest children first (zoom then says they were pruned), then the oldest roots. */
	prune(): void {
		const max = this.o.maxNodes ?? DEFAULT_MAX_NODES;
		let over = this.count("SELECT COUNT(*) c FROM node") - max;
		if (over <= 0) return;
		const slack = Math.ceil(max * 0.05);
		this.db.prepare("DELETE FROM node WHERE id IN (SELECT id FROM node WHERE parent IS NOT NULL ORDER BY level, ts_from LIMIT ?)").run(over + slack);
		over = this.count("SELECT COUNT(*) c FROM node") - max;
		if (over > 0) this.db.prepare("DELETE FROM node WHERE id IN (SELECT id FROM node WHERE state!='pending' ORDER BY ts_from LIMIT ?)").run(over + slack);
	}

	// ---------------------------------------------------------------- reading

	private line(n: MemNode): ViewLine {
		const pending = n.state === "pending";
		const when = n.kind === "merge" ? `L${n.level} ${dayOf(n.tsFrom)}→${dayOf(n.tsTo)}` : `${timeOf(n.tsFrom)} ${n.role}`;
		const text = pending ? `(not summarized yet) ${oneLine(n.raw ?? "", 160)}` : n.line ?? "";
		return { id: n.id, kind: n.kind, level: n.level, when, text, pending };
	}

	/** The constant-size view. `beforeTs`: leave out nodes at/after this time (the current turn is sent verbatim instead). */
	view(opts: { beforeTs?: number } = {}): MemoryView {
		const budget = this.o.config().viewBudgetChars;
		const roots = this.roots().filter((r) => opts.beforeTs === undefined || r.tsTo < opts.beforeTs);
		const fmt = (l: ViewLine) => `[#${l.id} ${l.when}] ${l.text}`;
		const header = `<memory_view lossy="true">\nOne line per message; older history is merged into coarser lines (L1, L2, ...). What a line omits is gone from this view: use memory_zoom(id) to expand a merged line, memory_date("YYYY-MM-DD") for a day.`;
		const footer = "</memory_view>";
		let size = header.length + footer.length + 80;
		const kept: ViewLine[] = [];
		for (let i = roots.length - 1; i >= 0; i--) {
			const l = this.line(roots[i]!);
			const len = fmt(l).length + 1;
			if (size + len > budget && kept.length) break;
			size += len;
			kept.unshift(l);
		}
		const omitted = roots.length - kept.length;
		const body = [omitted ? `[… ${omitted} older line(s) not shown to keep the view within its ${budget}-character budget${this.failure ? "; the summarizer is unavailable so they could not be merged" : ""}]` : "", ...kept.map(fmt)].filter(Boolean);
		const text = roots.length ? `${header}\n${body.join("\n")}\n${footer}` : `${header}\n(empty: this is the start of the conversation)\n${footer}`;
		return { text, lines: kept, size: text.length, budget, omitted };
	}

	/** Children of a merged line (or the line itself for a message). */
	zoom(id: number): { title: string; lines: ViewLine[]; note: string } {
		const n = this.get(id);
		if (!n) return { title: `#${id}`, lines: [], note: `No memory line #${id} (it may have been pruned to bound disk use).` };
		if (n.kind === "msg") return { title: `#${id}`, lines: [this.line(n)], note: "A single message line. The original text is in the chat transcript; this memory keeps only the line (lossy by design)." };
		const kids = this.all("SELECT * FROM node WHERE parent=? ORDER BY ts_from, id", id);
		return { title: `#${id} ${this.line(n).when}`, lines: kids.map((k) => this.line(k)), note: kids.length ? `${kids.length} line(s) merged into #${id}.` : `The lines merged into #${id} were pruned to bound disk use; only the merged line survives.` };
	}

	/** What happened on a day (YYYY-MM-DD, local time): message lines if kept, else the finest merged lines. Bounded. */
	date(day: string): { title: string; lines: ViewLine[]; note: string } {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
		if (!m) return { title: day, lines: [], note: "Use the format YYYY-MM-DD." };
		const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
		const end = start + 86_400_000;
		let nodes = this.all("SELECT * FROM node WHERE kind='msg' AND ts_from>=? AND ts_from<? ORDER BY ts_from, id LIMIT 80", start, end);
		let note = "";
		if (!nodes.length) {
			nodes = this.all("SELECT * FROM node WHERE kind='merge' AND ts_to>=? AND ts_from<? ORDER BY level, ts_from LIMIT 20", start, end);
			note = nodes.length ? "Message lines for this day were merged or pruned; showing the finest merged lines that overlap it." : "";
		}
		return { title: day, lines: nodes.map((n) => this.line(n)), note: note || (nodes.length ? "" : `Nothing is remembered for ${day}.`) };
	}

	status(): MemoryStatus {
		const roots = this.roots();
		const pending = this.count("SELECT COUNT(*) c FROM node WHERE state='pending'");
		const maxLevel = this.count("SELECT COALESCE(MAX(level),0) c FROM node");
		const page = this.count("SELECT page_count * page_size AS c FROM pragma_page_count(), pragma_page_size()");
		const message = this.failure ? this.failure.message : pending ? `${pending} message(s) waiting to be summarized.` : "Summarizer OK.";
		return { ok: !this.failure, message, nodes: this.count("SELECT COUNT(*) c FROM node"), roots: roots.length, pending, maxLevel, bytes: page };
	}

	close(): void { try { this.db.close(); } catch { /* already closed */ } }
}

// ---------------------------------------------------------------- the summarizer (real model call, no fakes)

const SYS_MESSAGE = "You maintain a compact memory of a chat between a user and their personal assistant. Write ONE line (plain text, no newlines, at most 400 characters) capturing what matters about the message below: requests, facts, decisions, names, numbers, outcomes. Anything you leave out is lost for good. Output only the line.";
const SYS_MERGE = "You maintain a compact memory of a chat. Merge the memory lines below (oldest first; [n] is the coarseness level) into ONE line (plain text, no newlines, at most 400 characters) that keeps the most important facts, decisions and names. Anything you leave out is lost for good. Output only the line.";

/** A summarizer backed by pi-ai: `pick()` returns the configured memory model (or the active model). */
export function llmSummarizer(models: Models, pick: () => { provider: string; modelId: string }): Summarize {
	return async (req) => {
		const ref = pick();
		if (!ref.provider || ref.provider === "none") throw new SummarizerUnavailable("No model provider is configured, so memory lines cannot be written. Add a provider key or a custom provider (Models & providers).");
		const model = models.getModel(ref.provider, ref.modelId);
		if (!model) throw new SummarizerUnavailable(`The memory model ${ref.provider}/${ref.modelId} is not available.`);
		if (!(await models.checkAuth(ref.provider).catch(() => undefined))) throw new SummarizerUnavailable(`No API key for ${ref.provider}, so memory lines cannot be written.`);
		const res = await models.completeSimple(model, {
			systemPrompt: req.kind === "merge" ? SYS_MERGE : SYS_MESSAGE,
			messages: [{ role: "user", content: req.kind === "merge" ? req.text : `${req.role ?? "message"}: ${req.text}`, timestamp: Date.now() }],
		}, { maxTokens: 300 });
		if (res.stopReason === "error" || res.stopReason === "aborted") throw new Error(res.errorMessage ?? `summarizer call ${res.stopReason}`);
		const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		if (!text.trim()) throw new Error("The summarizer returned no text.");
		return text;
	};
}

// ---------------------------------------------------------------- tools: the only navigation

const fmtLines = (r: { title: string; lines: ViewLine[]; note: string }) =>
	`${r.title}\n${r.lines.map((l) => `[#${l.id} ${l.when}] ${l.text}`).join("\n")}${r.note ? `\n(${r.note})` : ""}`.slice(0, 12_000);

export function memoryExtension(getMemory: () => MemoryManager) {
	return defineExtension({
		name: "pibots-memory",
		tools: [
			defineTool({
				name: "memory_zoom",
				description: "Expand a line of your <memory_view> by its id (the number after #): a merged line lists the older lines it summarizes. Lossy: only what the lines kept is available.",
				replay: "safe",
				parameters: Type.Object({ id: Type.Integer() }),
				execute: async (a) => ({ content: [{ type: "text", text: fmtLines(getMemory().zoom((a as { id: number }).id)) }] }),
			}),
			defineTool({
				name: "memory_date",
				description: "List what you remember from one day (YYYY-MM-DD, local time), from your temporal memory.",
				replay: "safe",
				parameters: Type.Object({ date: Type.String() }),
				execute: async (a) => ({ content: [{ type: "text", text: fmtLines(getMemory().date((a as { date: string }).date)) }] }),
			}),
		],
	});
}
