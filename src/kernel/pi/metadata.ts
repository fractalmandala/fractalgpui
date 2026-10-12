import { defineDoc, type SessionDocToken } from '@earendil-works/pi-durable';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';

/**
 * The session index: every session the app knows. `ConversationRecord` carries nothing but identity (no title,
 * no timestamps), so this session-scoped singleton document is the durable home
 * for all of it — one `watchDoc` subscription serves the whole history sidebar.
 */

export type AgentType = 'plan' | 'build' | 'ask';
export type AccessMode = 'supervised' | 'edits' | 'full';

export type SessionMeta = {
	title: string;
	/** Working folder of a plain session (chosen in the composer); bot sessions use their bot's workspace. Omitted when unset. */
	folder?: string;
	/** App-written: entries carry no timestamps. 0 = unknown (upgrade backfill → Older). */
	createdAt: number;
	updatedAt: number;
	pinned: boolean;
	archived: boolean;
	/** The session's own model, applied with `configure({model})` (§3). */
	provider: string;
	modelId: string;
	/** Mirrors the conversation's agent. Omit when unset — Chord rejects explicit `undefined`. */
	thinkingLevel?: ModelThinkingLevel;
	agentType: AgentType;
	access: AccessMode;
	/** Bot this session belongs to; omitted for plain sessions (never set to undefined: Chord rejects it). */
	botId?: string;
	/* Drafts are memory-only (§2.8: "not written to storage") — kept in `drafts`, not here. */
}

export type SessionsIndex = {
	sessions: Record<string, SessionMeta>;
}

export const SessionsDoc: SessionDocToken<SessionsIndex> = defineDoc({
	kind: 'fractal.sessions',
	version: 1,
	scope: 'session',
	initial: () => ({ sessions: {} })
});

export const DEFAULT_TITLE = 'New session';

/** A fresh index entry: what `conversationCreated` seeds for every new conversation. */
export function freshSession(now: number, provider: string, modelId: string): SessionMeta {
	return {
		title: DEFAULT_TITLE,
		createdAt: now,
		updatedAt: now,
		pinned: false,
		archived: false,
		provider,
		modelId,
		agentType: 'build',
		access: 'supervised'
	};
}

const WORDS = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * PRODUCT §1.18: the title is the first user message that is a sentence or
 * longer. Short probes ("hi", "are you there?") never qualify: a message needs
 * at least 5 words or at least 30 characters. Returns null when nothing qualifies.
 */
export function deriveTitle(firstUserTexts: readonly string[]): string | null {
	for (const raw of firstUserTexts) {
		const text = raw.trim().replace(/\s+/g, ' ');
		if (!text) continue;
		if (WORDS(text) >= 5 || text.length >= 30) return text.length > 120 ? text.slice(0, 120) : text;
	}
	return null;
}

/** Only a default title may be derived over — a rename always wins. */
export const mayDeriveTitle = (title: string) => title === '' || title === DEFAULT_TITLE;

export type TimeBucket = 'today' | 'yesterday' | 'previous14' | 'older';

const dayStart = (at: number) => {
	const d = new Date(at);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
};

/** PRODUCT §1.4 buckets, classified from `updatedAt` against an injected clock. */
export function classifyBucket(updatedAt: number, now: number): TimeBucket {
	const days = Math.floor((dayStart(now) - dayStart(updatedAt)) / 86400000);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days <= 14) return 'previous14';
	return 'older';
}

export interface SessionView {
	id: string;
	meta: SessionMeta;
}

const byRecency = (a: SessionView, b: SessionView) =>
	b.meta.updatedAt - a.meta.updatedAt || (a.id < b.id ? -1 : 1);

/**
 * Main-list order (§1.9): pinned sessions above unpinned ones, newest activity
 * first inside each group. Archived sessions never reach this function — the
 * caller filters them into the Archived group (§1.10).
 */
export function orderSessions(views: readonly SessionView[]): SessionView[] {
	const pinned = views.filter((v) => v.meta.pinned).sort(byRecency);
	const rest = views.filter((v) => !v.meta.pinned).sort(byRecency);
	return [...pinned, ...rest];
}

/**
 * What a session row shows. A real title when there is one; otherwise the date and time it started, so two
 * untitled sessions never look identical.
 */
export function sessionLabel(meta: Pick<SessionMeta, 'title' | 'createdAt' | 'updatedAt'>, seconds = false): string {
	if (meta.title && meta.title !== DEFAULT_TITLE) return meta.title;
	const at = meta.createdAt || meta.updatedAt;
	if (!at) return 'Chat';
	const d = new Date(at);
	const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
	return `Chat · ${date}, ${time}`;
}

/**
 * Labels for a list of rows, guaranteed distinct: rows whose label collides (two chats started in the same
 * minute) get seconds, and anything still colliding gets a counter.
 */
export function uniqueLabels(views: readonly SessionView[]): Map<string, string> {
	const out = new Map<string, string>();
	const count = new Map<string, number>();
	for (const v of views) count.set(sessionLabel(v.meta), (count.get(sessionLabel(v.meta)) ?? 0) + 1);
	const seen = new Map<string, number>();
	for (const v of views) {
		let label = sessionLabel(v.meta);
		if ((count.get(label) ?? 0) > 1 && v.meta.title !== label) label = sessionLabel(v.meta, true);
		const n = (seen.get(label) ?? 0) + 1;
		seen.set(label, n);
		out.set(v.id, n > 1 ? `${label} (${n})` : label);
	}
	return out;
}

/** A short "updated" stamp: time today, "Yesterday", else the date. Injected clock for tests. */
export function updatedLabel(updatedAt: number, now: number = Date.now()): string {
	if (!updatedAt) return '';
	const d = new Date(updatedAt);
	const bucket = classifyBucket(updatedAt, now);
	if (bucket === 'today') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	if (bucket === 'yesterday') return 'Yesterday';
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
