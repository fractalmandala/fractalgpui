import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { Draft } from '@earendil-works/chord';
import { Type } from '@earendil-works/pi-ai';
import type { Models } from '@earendil-works/pi-ai/models';
import {
	defineExtension,
	defineTool,
	section,
	type ConversationId,
	type Harness,
	type PromptInput,
	type ToolExecutionApi
} from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { AuditLog } from '../audit.ts';
import { projectEntries } from '../project.ts';
import { SessionsDoc } from '../metadata.ts';
import { data_dir } from '../../paths.ts';
import { assertValid, BotsDoc, type BotMeta, type BotsIndex, type Character, type DiffEntry, diffValues } from './meta.ts';
import { botPaths, ensureBotFolders } from './paths.ts';
import { cleanCharacterPatch, renderCapabilities, renderCharacter, renderIdentity } from './personality.ts';
import { propose, removeEntry, renderProfile, setEntry } from './profile.ts';
import { llmSummarizer, MemoryManager, type Summarize } from './memory.ts';

/**
 * The `fractal-bot` extension: what makes a session that has a `botId` behave as that bot.
 * It is NOT in the default extension selection; bot sessions select it at creation
 * (`botAgentChange`). Sessions without a bot never see its tools or sections.
 *   sections: identity -> character -> capabilities -> profile -> memory (temporal view)
 *   tools:    character_edit, profile_update, memory_zoom, memory_date
 */

export const BOT_EXTENSION = 'fractal-bot';

/** Process-wide wiring (set by `openHarness`; tests set it directly). */
export const botRuntime: {
	harness?: Harness;
	/** Data dir override (tests); default = the app data dir. */
	root?: string;
	models?: () => Models;
	/** Test seam: replaces the pi-ai summarizer. */
	summarize?: Summarize;
	now: () => number;
} = { now: () => Date.now() };

const ctx = () => BACKGROUND_CONTEXT;
const rootOf = () => botRuntime.root ?? data_dir();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const auditFor = (botId: string): AuditLog => {
	ensureBotFolders(botId, rootOf());
	return new AuditLog(botPaths(botId, rootOf()).audit);
};

/** The bot a session belongs to (id), or undefined for plain sessions. */
export async function botIdOf(api: Pick<ToolExecutionApi, 'snapshot' | 'conversationId'>, context: Context = ctx()): Promise<string | undefined> {
	const snap = await api.snapshot(SessionsDoc, context).catch(() => undefined);
	return snap?.sessions[String(api.conversationId)]?.botId;
}

// --- temporal memory, one SQLite file per bot ---------------------------------

type ModelPick = () => { provider: string; modelId: string };
type MemoryEntry = { m: MemoryManager; bot: BotMeta; model: ModelPick };
const memories = new Map<string, MemoryEntry>();

export function memoryFor(botId: string, bot: BotMeta, sessionModel: ModelPick): MemoryManager {
	const key = `${rootOf()}\0${botId}`;
	let e = memories.get(key);
	if (!e) {
		const entry = { bot, model: sessionModel } as MemoryEntry;
		const summarize: Summarize | undefined =
			botRuntime.summarize ??
			(botRuntime.models
				? llmSummarizer(botRuntime.models(), () => {
						const pick = entry.bot.memory.summaryModel;
						const i = pick.indexOf('/');
						return i > 0 ? { provider: pick.slice(0, i), modelId: pick.slice(i + 1) } : entry.model();
					})
				: undefined);
		ensureBotFolders(botId, rootOf());
		entry.m = new MemoryManager({ file: botPaths(botId, rootOf()).memory, config: () => entry.bot.memory, summarize });
		memories.set(key, entry);
		e = entry;
	}
	e.bot = bot;
	e.model = sessionModel;
	return e.m;
}

/** Close and forget every memory manager (tests, shutdown). */
export function closeMemories(): void {
	for (const e of memories.values()) e.m.close();
	memories.clear();
}

/** Record the conversation's finished user/assistant turns into the bot's memory (idempotent per entry). */
async function syncMemory(h: Harness, conversationId: ConversationId, m: MemoryManager): Promise<void> {
	const conv = await h.conversation(conversationId, ctx());
	if (!conv) return;
	const all: { id: string; kind: 'user' | 'assistant'; text: string }[] = [];
	let cursor: Parameters<typeof conv.entries>[2] = undefined;
	for (;;) {
		const page = await conv.entries({}, 200, cursor, ctx());
		for (const e of page.items) {
			const rows = projectEntries([e], undefined);
			for (const r of rows) if (r.kind === 'user' || r.kind === 'assistant') all.push({ id: String(e.id), kind: r.kind, text: r.text });
		}
		cursor = page.next;
		if (!cursor) break;
	}
	// scans are newest-first; the newest user message is the current turn: it goes verbatim, not into memory yet
	all.reverse();
	if (all.length && all[all.length - 1]!.kind === 'user') all.pop();
	let ts = botRuntime.now() - all.length;
	for (const r of all) m.record({ src: `${String(conversationId)}:${r.id}`, role: r.kind, text: r.text, ts: ts++ });
}

// --- prompt sections ----------------------------------------------------------

async function botOf(i: PromptInput): Promise<{ id: string; bot: BotMeta; model: { provider: string; modelId: string } } | undefined> {
	const sessions = await i.read.snapshot(SessionsDoc, ctx());
	const meta = sessions?.sessions[String(i.conversationId)];
	if (!meta?.botId) return undefined;
	const bots = await i.read.snapshot(BotsDoc, ctx());
	const bot = bots?.bots[meta.botId];
	return bot ? { id: meta.botId, bot, model: { provider: meta.provider, modelId: meta.modelId } } : undefined;
}

const secs = [
	section('bot-identity', async (i) => {
		const b = await botOf(i);
		return b && renderIdentity(b.bot);
	}, { tag: false }),
	section('bot-character', async (i) => {
		const b = await botOf(i);
		return b && renderCharacter(b.bot);
	}),
	section('bot-capabilities', async (i) => {
		const b = await botOf(i);
		return b && renderCapabilities(b.bot);
	}),
	section('bot-profile', async (i) => {
		const b = await botOf(i);
		return b && renderProfile(b.bot.profile);
	}),
	section('bot-memory', async (i) => {
		const b = await botOf(i);
		if (!b || !botRuntime.harness) return undefined;
		try {
			const m = memoryFor(b.id, b.bot, () => b.model);
			await syncMemory(botRuntime.harness, i.conversationId, m);
			return m.view().text;
		} catch (err) {
			return `<memory_view lossy="true">\n(memory unavailable: ${(err as Error).message})\n</memory_view>`;
		}
	}, { tag: false })
];

// --- tools --------------------------------------------------------------------

const text = (t: string, isError = false) => ({ isError, content: [{ type: 'text' as const, text: t }] });

/** Mutate a bot's row inside the tool's own transaction. Returns what `fn` returns. */
async function editBot<T>(api: ToolExecutionApi, context: Context, botId: string, fn: (bot: BotMeta) => T): Promise<T> {
	return api.commit(async (tx) => {
		const d: Draft<BotsIndex> = await tx.doc(BotsDoc);
		const cur = d.bots[botId];
		if (!cur) throw new Error('This bot no longer exists.');
		const next = clone(cur) as BotMeta;
		const out = fn(next);
		assertValid(next);
		next.updatedAt = botRuntime.now();
		d.bots[botId] = next;
		return out;
	}, context);
}

const characterEdit = defineTool({
	name: 'character_edit',
	description:
		'Adjust your own character (tone, verbosity, traits, how you address the user, style notes) when the user asks you to change how you behave. You cannot change your identity, capabilities or memory settings. Every change is audited and visible to the user.',
	parameters: Type.Object({
		tone: Type.Optional(Type.String()),
		verbosity: Type.Optional(Type.String()),
		traits: Type.Optional(Type.Array(Type.String())),
		addressUserAs: Type.Optional(Type.String()),
		notes: Type.Optional(Type.String()),
		reason: Type.String({ description: 'why (shown in the audit log)' })
	}),
	execute: async (args, api: ToolExecutionApi, context) => {
		const botId = await botIdOf(api, context);
		if (!botId) return text('This session has no bot, so there is no character to edit.', true);
		const { reason, ...rest } = args as { reason: string } & Partial<Character>;
		try {
			const patch = cleanCharacterPatch(rest);
			const diff: DiffEntry[] = await editBot(api, context, botId, (bot) => {
				if (!bot.capabilities.agentEditsCharacter) throw new Error('The user has switched off character editing by the agent.');
				const before = clone(bot.character);
				bot.character = { ...bot.character, ...patch };
				return diffValues(before, bot.character);
			});
			const msg = `character ${diff.length ? 'updated' : 'unchanged'}: ${Object.keys(patch).join(', ')}`;
			auditFor(botId).append({ phase: 'after', tool: 'character_edit', callId: api.callId, summary: msg, note: `by agent: ${reason}`, ok: true });
			return text(msg);
		} catch (err) {
			return text((err as Error).message, true);
		}
	}
});

const profileUpdate = defineTool({
	name: 'profile_update',
	description:
		'Your small always-present PROFILE (facts and preferences about the user that must never be forgotten; the conversation memory is lossy, the profile is not). ' +
		'op=commit writes an entry directly if the user allows it, otherwise it becomes a proposal the user must accept; op=propose always asks the user; op=remove deletes an entry. ' +
		'Keep entries short, one line, durable facts only (no secrets).',
	parameters: Type.Object({
		op: Type.Union([Type.Literal('commit'), Type.Literal('propose'), Type.Literal('remove')]),
		key: Type.String(),
		text: Type.Optional(Type.String()),
		reason: Type.Optional(Type.String())
	}),
	execute: async (args, api: ToolExecutionApi, context) => {
		const botId = await botIdOf(api, context);
		if (!botId) return text('This session has no bot, so there is no profile.', true);
		const a = args as { op: 'commit' | 'propose' | 'remove'; key: string; text?: string; reason?: string };
		try {
			const now = botRuntime.now();
			const msg = await editBot(api, context, botId, (bot) => {
				const cap = bot.memory.profileCapBytes;
				if (a.op === 'remove') {
					if (!bot.memory.agentMayCommitProfile) throw new Error('You may not delete profile entries; ask the user to remove it in the bot editor.');
					return removeEntry(bot.profile, a.key);
				}
				if (!a.text) throw new Error('text is required for commit/propose.');
				if (a.op === 'commit' && bot.memory.agentMayCommitProfile) return setEntry(bot.profile, cap, a.key, a.text, 'agent', now);
				const r = propose(bot.profile, a.key, a.text, a.reason ?? '', now);
				return a.op === 'commit' ? `${r} (direct commits are off; waiting for the user to accept)` : r;
			});
			auditFor(botId).append({ phase: 'after', tool: 'profile_update', callId: api.callId, summary: `${a.op} ${a.key}: ${msg}`, note: `by agent${a.reason ? `: ${a.reason}` : ''}`, ok: true });
			return text(msg);
		} catch (err) {
			return text((err as Error).message, true);
		}
	}
});

async function memoryOfCall(api: ToolExecutionApi, context: Context): Promise<MemoryManager | string> {
	const botId = await botIdOf(api, context);
	if (!botId) return 'This session has no bot, so there is no memory.';
	const bots = await api.snapshot(BotsDoc, context);
	const bot = bots?.bots[botId];
	if (!bot) return 'This bot no longer exists.';
	const sessions = await api.snapshot(SessionsDoc, context);
	const meta = sessions?.sessions[String(api.conversationId)];
	return memoryFor(botId, bot as BotMeta, () => ({ provider: meta?.provider ?? '', modelId: meta?.modelId ?? '' }));
}

const fmtLines = (r: { title: string; lines: { id: number; when: string; text: string }[]; note: string }) =>
	`${r.title}\n${r.lines.map((l) => `[#${l.id} ${l.when}] ${l.text}`).join('\n')}${r.note ? `\n(${r.note})` : ''}`.slice(0, 12_000);

const memoryZoom = defineTool({
	name: 'memory_zoom',
	description: 'Expand a line of your <memory_view> by its id (the number after #): a merged line lists the older lines it summarizes. Lossy: only what the lines kept is available.',
	replay: 'safe',
	parameters: Type.Object({ id: Type.Integer() }),
	execute: async (a, api: ToolExecutionApi, context) => {
		const m = await memoryOfCall(api, context);
		return typeof m === 'string' ? text(m, true) : text(fmtLines(m.zoom((a as { id: number }).id)));
	}
});

const memoryDate = defineTool({
	name: 'memory_date',
	description: 'List what you remember from one day (YYYY-MM-DD, local time), from your temporal memory.',
	replay: 'safe',
	parameters: Type.Object({ date: Type.String() }),
	execute: async (a, api: ToolExecutionApi, context) => {
		const m = await memoryOfCall(api, context);
		return typeof m === 'string' ? text(m, true) : text(fmtLines(m.date((a as { date: string }).date)));
	}
});

export const botTools = defineExtension({
	name: BOT_EXTENSION,
	sections: secs,
	tools: [characterEdit, profileUpdate, memoryZoom, memoryDate]
});

/**
 * Detach a session from bot behaviour: clear its explicit extension selection so it follows
 * the host default again (which does not include the bot extension).
 */
export async function botExtensionOff(h: Harness, id: ConversationId): Promise<void> {
	const conv = await h.conversation(id, ctx());
	if (!conv) return;
	await conv.configure({ extensions: null }, ctx());
}
