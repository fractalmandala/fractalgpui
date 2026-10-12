import { defineDoc, type SessionDocToken } from '@earendil-works/pi-durable';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';

/**
 * The session index: every session the app knows, and every project folder it
 * groups them under. `ConversationRecord` carries nothing but identity (no title,
 * no timestamps), so this session-scoped singleton document is the durable home
 * for all of it — one `watchDoc` subscription serves the whole history sidebar.
 */

export type AgentType = 'plan' | 'build' | 'ask';
export type AccessMode = 'supervised' | 'edits' | 'full';

export type SessionMeta = {
	title: string;
	/** Project id, or null for stray sessions (§1.2). Fixed at creation (§1.15), moved by §1.16. */
	projectId: string | null;
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

export type ProjectMeta = {
	/** Absolute folder path. The app never writes into it (§1.19). */
	path: string;
	/** Display name; defaults to the folder's base name. */
	name: string;
	pinned: boolean;
	archived: boolean;
}

export type SessionsIndex = {
	sessions: Record<string, SessionMeta>;
	projects: Record<string, ProjectMeta>;
}

export const SessionsDoc: SessionDocToken<SessionsIndex> = defineDoc({
	kind: 'fractal.sessions',
	version: 1,
	scope: 'session',
	initial: () => ({ sessions: {}, projects: {} })
});

export const DEFAULT_TITLE = 'New session';

/** A fresh index entry: what `conversationCreated` seeds for every new conversation. */
export function freshSession(projectId: string | null, now: number, provider: string, modelId: string): SessionMeta {
	return {
		title: DEFAULT_TITLE,
		projectId,
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

export interface ProjectView {
	id: string;
	meta: ProjectMeta;
	/** Newest activity of any of its non-archived sessions, 0 when it has none. */
	activity: number;
}

/** Project order: pinned first, then most-recent session activity (§1.3, §1.9). */
export function orderProjects(views: readonly ProjectView[]): ProjectView[] {
	const byActivity = (a: ProjectView, b: ProjectView) =>
		b.activity - a.activity || (a.id < b.id ? -1 : 1);
	return [
		...views.filter((v) => v.meta.pinned).sort(byActivity),
		...views.filter((v) => !v.meta.pinned).sort(byActivity)
	];
}

/** Most recent `updatedAt` among a project's non-archived sessions (0 when none). */
export function projectActivity(projectId: string, sessions: readonly SessionView[]): number {
	let at = 0;
	for (const s of sessions) {
		if (s.meta.projectId === projectId && !s.meta.archived && s.meta.updatedAt > at) {
			at = s.meta.updatedAt;
		}
	}
	return at;
}
