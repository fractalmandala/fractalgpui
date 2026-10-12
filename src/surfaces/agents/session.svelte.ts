import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AttachedReplicatedState } from '@earendil-works/chord';
import type { Conversation, ConversationId, ConversationView, DocumentWatch, Harness } from '@earendil-works/pi-durable';
import type { Message, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai/models';
import { persisted } from '../../kernel/storage.svelte.ts';
import { flash } from '../../kernel/status.svelte.ts';
import { openHarness, pi_context, piModels } from '../../kernel/pi/harness.svelte.ts';
import { firstKeptOf, isTestEnv, keyStatus, resolveDefault } from '../../kernel/pi/models.ts';
import { formatUsage, isBusy, projectEntries, type ChatRow } from '../../kernel/pi/project.ts';
import { deriveTitle, mayDeriveTitle, SessionsDoc, type AccessMode, type AgentType } from '../../kernel/pi/metadata.ts';
import { contextFigures, countToolCalls, createSpeedTracker, providerFigures, toolFigures, type UsageBuckets } from '../../kernel/pi/usage.ts';
import { ApprovalsDoc, decideApproval, TodosDoc, type ApprovalsState, type TodosState } from '../../kernel/pi/tools.ts';
import { isProviderEnabled } from '../../kernel/pi/models.ts';
import {
	createSession,
	ensureSessions,
	forkSession,
	index as sessionIndex,
	sessionWorkspace,
	botIndex,
	removeSession as removeSessionRecords,
	renameSession,
	sessionMeta,
	touchSession
} from '../../kernel/pi/sessions.svelte.ts';
import {
	ensureSessionMeta,
	patchSession,
	type ModelRef
} from '../../kernel/pi/sessions-io.ts';
import type { TodoItem } from '../../kernel/pi/tools.ts';

export type { ChatRow };

/** Watch-establishment attempts cost two queued doc reads; retry at most this often. */
const WATCH_RETRY_MS = 2000;

/** Provider options from the live catalog (enabled providers first). Replaces the curated-five list. */
export const provider_options = () => {
	const all = piModels().getProviders();
	const order = (id: string) => (isProviderEnabled(id) ? 0 : 1);
	return [...all].sort((a, b) => order(a.id) - order(b.id)).map((p) => ({ value: p.id, label: p.name ?? p.id }));
};

export interface ModelOption {
	id: string;
	name: string;
}

/**
 * One live conversation behind the transcript/composer facade (rows/busy/send/
 * stop/reset). Slice 2: exactly one instance per open session, held in `chats`
 * and shared by every region showing that session — a second view subscribes
 * nothing extra. The model, thinking level, type and access are per session
 * (from `SessionMeta`); the `pi` slot is only the default for new sessions.
 */
export class AgentChat {
	readonly key: string;
	private readonly cid: ConversationId;
	private readonly opener: () => Promise<Conversation>;

	rows = $state<ChatRow[]>([]);
	busy = $state(false);
	error = $state<string | null>(null);
	usageText = $state('$0.00 · 0 tokens');
	modelOptions = $state<ModelOption[]>([]);
	todos = $state<TodoItem[]>([]);
	approvals = $state<ApprovalsState | null>(null);

	private _provider = $state('');
	private _modelId = $state('');
	private _thinkingLevel = $state<ModelThinkingLevel | undefined>(undefined);
	private _agentType = $state<AgentType>('build');
	private _access = $state<AccessMode>('supervised');

	private conv: Conversation | null = null;
	private view: AttachedReplicatedState<ConversationView> | null = null;
	private unsub: (() => void) | null = null;
	private opening: Promise<void> | null = null;
	private sending = false;
	private approvalsStop: (() => void) | null = null;
	private todosSnap: TodosState | null = null;
	private todosStop: (() => void) | null = null;

	constructor(
		key: string,
		cid: ConversationId,
		meta: { provider: string; modelId: string; thinkingLevel?: ModelThinkingLevel; agentType: AgentType; access: AccessMode },
		opener: () => Promise<Conversation>
	) {
		this.key = key;
		this.cid = cid;
		this.opener = opener;
		this._provider = meta.provider;
		this._modelId = meta.modelId;
		this._thinkingLevel = meta.thinkingLevel;
		this._agentType = meta.agentType;
		this._access = meta.access;
	}

	get provider(): string {
		return this._provider;
	}

	set provider(id: string) {
		if (!piModels().getProvider(id)) return;
		this._provider = id;
		this._modelId = firstKeptOf(piModels(), id) ?? this._modelId;
		void this.persistModel();
		void this.reconfigure();
	}

	get modelId(): string {
		return isTestEnv() ? 'faux-1' : this._modelId;
	}

	set modelId(id: string) {
		this._modelId = id.trim();
		void this.persistModel();
		void this.reconfigure();
	}

	get thinkingLevel(): ModelThinkingLevel | undefined {
		return this._thinkingLevel;
	}

	set thinkingLevel(level: ModelThinkingLevel | null) {
		this._thinkingLevel = level ?? undefined;
		void this.persistThinking();
		void this.reconfigure();
	}

	get agentType(): AgentType {
		return this._agentType;
	}

	set agentType(type: AgentType) {
		this._agentType = type;
		void this.persistAccess();
	}

	get access(): AccessMode {
		return this._access;
	}

	set access(mode: AccessMode) {
		this._access = mode;
		void this.persistAccess();
	}

	/** Inline transcript notice (§3.5 thinking fallback). Cleared on next send. */
	noticeText = $state<string | null>(null);

	private speed = createSpeedTracker();

	/**
	 * Apply a model panel choice: provider + model together, with the §3.5
	 * thinking fallback (keeps the lowest supported level at least as capable,
	 * reports the change as an inline notice, never reassigns silently).
	 */
	applyModel(provider: string, modelId: string) {
		if (!piModels().getProvider(provider)) return;
		this._provider = provider;
		this._modelId = modelId.trim() || this._modelId;
		try {
			const model = piModels().getModel(provider, this._modelId);
			if (model && this._thinkingLevel !== undefined) {
				const supported = getSupportedThinkingLevels(model);
				if (!supported.includes(this._thinkingLevel)) {
					const order: ModelThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
					const self = order.indexOf(this._thinkingLevel);
					const below = order.slice(0, self).filter((l) => supported.includes(l));
					const next = supported.find((l) => order.indexOf(l) >= self) ?? below[below.length - 1] ?? supported[0];
					if (next && next !== this._thinkingLevel) {
						this._thinkingLevel = next;
						this.noticeText = `That thinking level isn't supported by ${this._modelId}; using ${next} instead.`;
						void this.persistThinking();
					}
				}
			}
		} catch {
			// Offline catalog: no fallback check, the send reconciles.
		}
		void this.persistModel();
		void this.reconfigure();
	}

	/** Record the user's answer on a pending approval row. */
	async decide(callId: string, verdict: 'approved' | 'denied'): Promise<void> {
		try {
			const h = await openHarness();
			await decideApproval(h, this.cid, callId, verdict);
			// The decision commit may be the first thing that creates the doc
			// (or the run may be otherwise quiet): retry the watch now so the
			// row flips without waiting for the next render-driven attempt.
			this.watchRetryAt = 0;
			this.ensureAppWatches();
		} catch (err) {
			this.error = `Could not answer that approval: ${(err as Error).message ?? err}`;
		}
	}

	/** Committed messages for the context estimate (user + assistant only). */
	contextMessages(): Message[] {
		const entries = (this.view?.value.entries ?? []) as unknown as readonly { kind?: unknown; model?: unknown }[];
		const out: Message[] = [];
		for (const e of entries) {
			if (e.kind !== 'pi.user' && e.kind !== 'pi.assistant') continue;
			const m = Array.isArray(e.model) ? e.model[0] : undefined;
			if (m && typeof m === 'object' && 'role' in (m as object)) out.push(m as Message);
		}
		return out;
	}

	/** Everything the usage popover renders, computed from this session's records. */
	usageSnapshot() {
		const docs = (this.view?.value.docs ?? {}) as unknown as Record<string, unknown>;
		const usage = docs['pi.usage'] as unknown as UsageBuckets | undefined;
		const live = docs['pi.live'] as unknown as { tools?: { name?: unknown }[] } | undefined;
		const entries = (this.view?.value.entries ?? []) as unknown as readonly { kind: string }[];
		let modelWindow: number | null = null;
		try {
			const ref = this.modelRef();
			modelWindow = piModels().getModel(ref.provider, ref.modelId)?.contextWindow ?? null;
		} catch {
			modelWindow = null;
		}
		return {
			context: modelWindow !== null ? contextFigures(this.contextMessages(), modelWindow) : null,
			provider: providerFigures(usage),
			tools: toolFigures(usage, live?.tools),
			calls: countToolCalls(entries),
			speed: this.speed.rate
		};
	}

	get keyHint(): string {
		return keyStatus(this.provider).hint;
	}

	get keyOk(): boolean {
		return keyStatus(this.provider).ok;
	}

	private modelRef(): ModelRef {
		if (isTestEnv()) return { provider: 'faux', modelId: 'faux-1' };
		return { provider: this._provider, modelId: this._modelId };
	}

	private workspacePath(): string | undefined {
		return sessionWorkspace(this.key);
	}

	/** The usage document for speed deltas (absent until the view opens). */
	private usageDocs(): UsageBuckets | undefined {
		return (this.view?.value.docs ?? {})['pi.usage'] as unknown as UsageBuckets | undefined;
	}

	private async persistModel(): Promise<void> {
		try {
			const h = await openHarness();
			await patchSession(h, this.cid, { provider: this._provider, modelId: this._modelId });
		} catch (err) {
			this.error = `Could not save the model: ${(err as Error).message ?? err}`;
		}
	}

	private async persistThinking(): Promise<void> {
		try {
			const h = await openHarness();
			await patchSession(h, this.cid, { thinkingLevel: this._thinkingLevel });
		} catch (err) {
			this.error = `Could not save the thinking level: ${(err as Error).message ?? err}`;
		}
	}

	private async persistAccess(): Promise<void> {
		try {
			const h = await openHarness();
			await patchSession(h, this.cid, { agentType: this._agentType, access: this._access });
		} catch (err) {
			this.error = `Could not save the session settings: ${(err as Error).message ?? err}`;
		}
	}

	private async ensure(): Promise<Conversation> {
		if (this.conv) return this.conv;
		if (!this.opening) {
			this.opening = (async () => {
				try {
					const h = await openHarness();
					const ctx = pi_context();
					this.conv = await this.opener();
					await this.reconcile(this.conv);
					this.view = await this.conv.viewState(ctx);
					await this.ensureModels();
					this.render();
					this.unsub = this.view.subscribe(() => this.render());
					// The view mounts built-in documents only — the app's own
					// conversation docs ride on their own watches (Slice 7).
					this.ensureAppWatches();
				} catch (err) {
					this.opening = null;
					this.conv = null;
					throw err;
				}
			})();
		}
		await this.opening;
		return this.conv!;
	}

	/**
	 * Watch the app's own conversation docs. Watches are non-creating: before
	 * the first commit that creates a doc, `watchDoc` yields nothing, so this
	 * retries on open, on send, and on render until both watches stand — but
	 * at most one attempt per WATCH_RETRY_MS. An attempt never chains into
	 * the next one (no render-on-completion): respawning from completion is
	 * a tight self-feeding loop that saturates the session queue and starves
	 * timers (F22). A watch failure keeps the old behaviour (view docs only).
	 */
	private watchingDocs = false;

	private watchRetryAt = 0;

	private watchRetryTimer: ReturnType<typeof setTimeout> | null = null;

	private ensureAppWatches(): void {
		if (this.watchingDocs || !this.conv || (this.approvalsStop && this.todosStop)) return;
		const now = Date.now();
		if (now - this.watchRetryAt < WATCH_RETRY_MS) return;
		this.watchRetryAt = now;
		this.scheduleWatchAttempt();
	}

	/**
	 * One fire-and-forget watch-establishment attempt. When neither watch
	 * stands afterwards, a single unref'd timer re-arms the next attempt —
	 * renders alone cannot be the only driver: a run paused on an approval
	 * commits nothing, so nothing re-renders until the user answers.
	 */
	private scheduleWatchAttempt(): void {
		if (this.watchingDocs || !this.conv || (this.approvalsStop && this.todosStop)) return;
		this.watchingDocs = true;
		void (async () => {
			let established = false;
			try {
				const h = await openHarness();
				const ctx = pi_context();
				const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
				if (!this.approvalsStop) {
					try {
						const approvals = await h.watchDoc(ApprovalsDoc, this.cid, ctx);
						if (approvals) {
							this.approvals = clone(approvals.value ?? { calls: {} });
							approvals.start(async (value) => {
								this.approvals = clone(value ?? { calls: {} });
								this.render();
							});
							this.approvalsStop = () => void approvals.stop();
							established = true;
						}
					} catch {
						// View docs only.
					}
				}
				if (!this.todosStop) {
					try {
						const todos = await h.watchDoc(TodosDoc, this.cid, ctx);
						if (todos) {
							this.todosSnap = clone(todos.value ?? { items: [], updatedAt: 0 });
							todos.start(async (value) => {
								this.todosSnap = clone(value ?? { items: [], updatedAt: 0 });
								this.render();
							});
							this.todosStop = () => void todos.stop();
							established = true;
						}
					} catch {
						// View docs only.
					}
				}
			} finally {
				this.watchingDocs = false;
				if (established) this.render();
				if (!(this.approvalsStop && this.todosStop)) this.armWatchRetry();
			}
		})();
	}

	/**
	 * Re-arm one watch-establishment attempt after WATCH_RETRY_MS. Unref'd
	 * so idle chats never hold the process (or a test) open; a single
	 * pending timer at most, cleared on close.
	 */
	private armWatchRetry(): void {
		if (this.watchRetryTimer || !this.conv || (this.approvalsStop && this.todosStop)) return;
		this.watchRetryTimer = setTimeout(() => {
			this.watchRetryTimer = null;
			this.watchRetryAt = 0;
			this.ensureAppWatches();
		}, WATCH_RETRY_MS);
		(this.watchRetryTimer as unknown as { unref?: () => void }).unref?.();
	}

	/** Fetched model list for this session's provider: sync catalog first, live refresh after. */
	async ensureModels(): Promise<void> {
		const provider = isTestEnv() ? 'faux' : this._provider;
		const read = () => {
			try {
				return piModels()
					.getModels(provider)
					.map((m) => ({ id: (m as { id: string }).id, name: (m as { name?: string }).name ?? (m as { id: string }).id }));
			} catch {
				return [];
			}
		};
		this.modelOptions = read();
		if (!isTestEnv()) {
			try {
				await piModels().refresh();
				this.modelOptions = read();
			} catch {
				// Offline or unconfigured: the bundled catalog stands.
			}
		}
	}

	/** Display name for the selected model, falling back to its id. */
	modelLabel(): string {
		return this.modelOptions.find((m) => m.id === this.modelId)?.name ?? this.modelId;
	}

	/**
	 * The conversation runs what the UI shows. root() ignores agent for an
	 * existing conversation (e.g. after a restart) and settings can move
	 * under a live chat, so compare-and-commit on every send, not just once.
	 */
	private async reconcile(conv: Conversation): Promise<void> {
		const model = this.modelRef();
		const agent = await conv.agent(pi_context());
		const cwd = this.workspacePath() ?? null;
		const sameModel = agent?.model?.provider === model.provider && agent?.model?.modelId === model.modelId;
		const sameThinking = this._thinkingLevel === undefined || agent?.thinkingLevel === this._thinkingLevel;
		const sameCwd = (agent?.cwd ?? null) === cwd;
		if (sameModel && sameThinking && sameCwd) return;
		await conv.configure(
			{ model, ...(this._thinkingLevel !== undefined ? { thinkingLevel: this._thinkingLevel } : {}), cwd },
			pi_context()
		);
	}

	private async reconfigure(): Promise<void> {
		if (!this.conv) return;
		try {
			await this.reconcile(this.conv);
		} catch (err) {
			this.error = `Could not switch model: ${(err as Error).message ?? err}`;
		}
	}

	private render() {
		if (!this.view) return;
		this.ensureAppWatches();
		const value = this.view.value;
		const docs = { ...(value.docs as Record<string, unknown>) };
		if (this.approvals) docs['fractal.approvals'] = this.approvals;
		this.rows = projectEntries(value.entries, docs['pi.live'] as Record<string, unknown> | undefined, docs);
		this.busy = this.sending || isBusy(docs['pi.live'] as Record<string, unknown> | undefined);
		this.usageText = formatUsage(docs);
		const items = this.todosSnap?.items ?? [];
		this.todos = (Array.isArray(items) ? items : [])
			.filter((i) => typeof (i as { text?: unknown }).text === 'string')
			.map((i) => {
				const item = i as { text?: unknown; status?: unknown };
				return {
					text: item.text as string,
					status: item.status === 'completed' || item.status === 'in_progress' ? (item.status as 'completed' | 'in_progress') : ('pending' as const)
				};
			});
	}

	async send(text: string): Promise<void> {
		const clean = text.trim();
		if (!clean) return;
		this.error = null;
		this.noticeText = null;
		if (!this.keyOk) {
			this.error = keyStatus(this.provider).hint;
			flash(this.error, 'danger');
			return;
		}
		let conv: Conversation;
		try {
			conv = await this.ensure();
			await this.reconcile(conv);
		} catch (err) {
			this.error = `Could not open the session: ${(err as Error).message ?? err}`;
			return;
		}
		// Title + recency land before the run so the sidebar updates immediately.
		// Index writes must not block the send itself.
		try {
			const meta = sessionMeta(this.key);
			if (meta && mayDeriveTitle(meta.title)) {
				const title = deriveTitle([clean]);
				if (title) await renameSession(conv.id, title);
			}
			await touchSession(conv.id);
		} catch (err) {
			console.warn(`[fractalgpui] session touch failed: ${(err as Error).message}`);
		}
		this.sending = true;
		this.render();
		this.ensureAppWatches();
		const outputBefore = providerFigures(this.usageDocs()).output;
		this.speed.start();
		try {
			const submission = await conv.submit({ type: 'input', content: clean }, pi_context());
			const settled = await submission.wait(pi_context());
			if (settled.status !== 'done') {
				const detail = settled.status === 'unanswered' && typeof settled.detail === 'string' ? settled.detail : '';
				const reason = settled.status === 'unanswered' && settled.reason ? settled.reason : settled.status;
				this.error = detail ? `${reason}: ${detail}` : `The run ended without an answer (${reason})`;
			}
		} catch (err) {
			this.error = `Send failed: ${(err as Error).message ?? err}`;
		} finally {
			this.sending = false;
			this.speed.stop(Math.max(0, providerFigures(this.usageDocs()).output - outputBefore));
			this.render();
		}
	}

	async stop(): Promise<void> {
		this.sending = false;
		if (!this.conv) return;
		try {
			await this.conv.abort(BACKGROUND_CONTEXT);
		} catch (err) {
			this.error = `Stop failed: ${(err as Error).message ?? err}`;
		} finally {
			this.render();
		}
	}

	async reset(): Promise<void> {
		this.error = null;
		try {
			const conv = await this.ensure();
			await conv.reset(undefined, pi_context());
		} catch (err) {
			this.error = `Reset failed: ${(err as Error).message ?? err}`;
		}
	}

	/** Drop the view subscription; the registry forgets this instance. */
	close() {
		this.unsub?.();
		this.unsub = null;
		this.approvalsStop?.();
		this.approvalsStop = null;
		this.todosStop?.();
		this.todosStop = null;
		if (this.watchRetryTimer) {
			clearTimeout(this.watchRetryTimer);
			this.watchRetryTimer = null;
		}
		this.view = null;
		this.conv = null;
		this.opening = null;
		chats.delete(this.key);
	}
}

// --- registry + active sessions -------------------------------------------

/** Every open chat, by session id string. One instance per session, shared by all regions. */
export const chats = new Map<string, AgentChat>();

const activeSlot = persisted('pi-active', { surface: [] as string[], panel: null as string | null });

/** Open session ids: `surface[0]` is the shown tab (tabs order = recency). */
export const active = $state<{ surface: string[]; panel: string | null }>({ surface: [], panel: null });

/** The chats currently rendered. Components render only once this flips. */
export const view = $state<{ surface: AgentChat | null; panel: AgentChat | null }>({ surface: null, panel: null });

export const uiReady = $state({ current: false });

function defaults(): ModelRef {
	return resolveDefault(piModels());
}

export async function openSessionChat(id: string): Promise<AgentChat> {
	const existing = chats.get(id);
	if (existing) return existing;
	await ensureSessions();
	const h = await openHarness();
	const cid = Number(id) as ConversationId;
	const snap = await h.snapshot(SessionsDoc, pi_context());
	const meta = snap?.sessions[id];
	if (!meta) throw new Error(`[fractalgpui] unknown session ${id}`);
	const chat = new AgentChat(
		id,
		cid,
		{
			provider: meta.provider,
			modelId: meta.modelId,
			thinkingLevel: meta.thinkingLevel,
			agentType: meta.agentType,
			access: meta.access
		},
		async () => {
			const hh = await openHarness();
			const found = await hh.conversation(cid, pi_context());
			if (found) return found;
			const root = await hh.root(pi_context());
			if (String(root.id) === id) return root;
			throw new Error('This session no longer exists in storage.');
		}
	);
	chats.set(id, chat);
	return chat;
}

/** First boot (or corrupted slot): valid persisted ids win, else the newest
 * live session, ties to the smallest numeric id so the root wins upgrades. */
let activeOpening: Promise<void> | null = null;
export function ensureActive(): Promise<void> {
	if (uiReady.current) return Promise.resolve();
	if (!activeOpening) activeOpening = bootActive();
	return activeOpening;
}

async function bootActive(): Promise<void> {
	await ensureSessions();
	const h = await openHarness();
	const root = await h.root(pi_context());
	const rootKey = String(root.id);
	await ensureSessionMeta(h, root.id, defaults());
	const snap = await h.snapshot(SessionsDoc, pi_context());
	const sessions = snap?.sessions ?? {};
	const known = (id: string | null): id is string => !!id && !!sessions[id];
	let surface = activeSlot.surface.filter(known);
	if (!surface.length) {
		const rows = Object.entries(sessions)
			.filter(([, m]) => !m.archived)
			.sort((a, b) => b[1].updatedAt - a[1].updatedAt || Number(a[0]) - Number(b[0]));
		surface = [rows.length ? rows[0][0] : rootKey];
	}
	active.surface = surface;
	activeSlot.surface = surface;
	active.panel = known(activeSlot.panel) ? activeSlot.panel : null;
	activeSlot.panel = active.panel;
	view.surface = await openSessionChat(surface[0]);
	if (active.panel) view.panel = await openSessionChat(active.panel);
	uiReady.current = true;
}

/** The shown tab's chat. Throws before `ensureActive()` has run. */
export function mainChat(): AgentChat {
	if (!view.surface) throw new Error('[fractalgpui] agent surface not ready — call ensureActive() first');
	return view.surface;
}

/** Select a tab: the chat opens (or reuses) and moves to the front. */
export async function selectSession(id: string): Promise<AgentChat> {
	await ensureActive();
	if (!sessionMeta(id)) throw new Error(`[fractalgpui] unknown session ${id}`);
	const chat = await openSessionChat(id);
	active.surface = [id, ...active.surface.filter((s) => s !== id)];
	activeSlot.surface = active.surface;
	view.surface = chat;
	return chat;
}

/** What a new session inherits from the one beside it: the same bot, or the same folder for a plain session. */
const inherit = (m: { botId?: string; folder?: string } | undefined) => (m?.botId ? { botId: m.botId } : m?.folder ? { folder: m.folder } : {});

/** A new chat for a bot, selected and ready (the bot's own session list, see SessionList). */
export async function newChatForBot(botId: string | null): Promise<AgentChat> {
	await ensureActive();
	const id = await createSession(defaults(), botId ? { botId } : {});
	return selectSession(String(id));
}

/** ⌘N: a session like the current one (same bot or folder), selected and ready. */
export async function newSession(): Promise<AgentChat> {
	await ensureActive();
	const current = view.surface ? sessionMeta(view.surface.key) : undefined;
	const id = await createSession(defaults(), inherit(current));
	return selectSession(String(id));
}

/**
 * The panel's chat, creating its session on first use. Never the same id as a
 * surface tab (D5) — a fresh id cannot collide.
 */
let panelOpening: Promise<AgentChat> | null = null;
export function panelChat(): Promise<AgentChat> {
	if (view.panel) return Promise.resolve(view.panel);
	if (!panelOpening) panelOpening = openPanelChat();
	return panelOpening;
}

async function openPanelChat(): Promise<AgentChat> {
	await ensureActive();
	if (view.panel) return view.panel;
	const current = view.surface ? sessionMeta(view.surface.key) : undefined;
	const id = await createSession(defaults(), inherit(current));
	active.panel = String(id);
	activeSlot.panel = active.panel;
	view.panel = await openSessionChat(active.panel);
	return view.panel;
}

/**
 * Point the panel at a session. Refuses an id the surface already shows (D5):
 * two regions must never hold the same conversation.
 */
export async function setPanelSession(id: string | null): Promise<boolean> {
	await ensureActive();
	if (id && active.surface.includes(id)) {
		flash('That session is already open in the main area', 'info');
		return false;
	}
	active.panel = id;
	activeSlot.panel = id;
	panelOpening = null;
	view.panel = id ? await openSessionChat(id) : null;
	return true;
}

/** Delete a session: stop its run, drop its records, and activate the newest
 * remaining session (or create an empty one when none remain, §1.13). */
export async function deleteSession(id: string): Promise<string> {
	await ensureActive();
	const open = chats.get(id);
	if (open) {
		try {
			await open.stop();
		} catch {
			// stopping a dead run must not block the delete
		}
		open.close();
	}
	await removeSessionRecords(Number(id) as ConversationId);
	const h = await openHarness();
	const snap = await h.snapshot(SessionsDoc, pi_context());
	const remaining = Object.entries(snap?.sessions ?? {})
		.filter(([, m]) => !m.archived)
		.sort((a, b) => b[1].updatedAt - a[1].updatedAt || Number(a[0]) - Number(b[0]));
	let next = remaining.length ? remaining[0][0] : null;
	if (!next) {
		const created = await createSession(defaults());
		next = String(created);
	}
	active.surface = [next, ...active.surface.filter((s) => s !== id && s !== next)];
	activeSlot.surface = active.surface;
	view.surface = await openSessionChat(next);
	if (active.panel === id) {
		active.panel = null;
		activeSlot.panel = null;
		panelOpening = null;
		view.panel = null;
	}
	return next;
}
/**
 * Branch from here (§1.11): a second session inheriting the source's history
 * up to its newest entry, selected, source untouched. An empty source has
 * nothing to inherit, so it creates a fresh session for the same bot or folder.
 */
export async function branchSession(id: string): Promise<AgentChat | null> {
	await ensureActive();
	const meta = sessionMeta(id);
	if (!meta) return null;
	const h = await openHarness();
	const cid = Number(id) as ConversationId;
	const conv = await h.conversation(cid, pi_context());
	if (!conv) {
		flash('That session no longer exists in storage', 'danger');
		return null;
	}
	const page = await conv.entries({}, 1, undefined, pi_context());
	const at = page.items[0]?.id;
	if (!at) {
		const fresh = await createSession({ provider: meta.provider, modelId: meta.modelId }, inherit(meta));
		return selectSession(String(fresh));
	}
	const forked = await forkSession(cid, at, { provider: meta.provider, modelId: meta.modelId }, { ...(meta.folder ? { folder: meta.folder } : {}), title: meta.title });
	return selectSession(String(forked));
}
