/**
 * The Bots views' state. Durable data (the bots, their sessions) is read from the reactive
 * mirrors in `kernel/pi/sessions.svelte.ts`; everything here is the editor's working state:
 * which bot is selected, its draft, the save preview, and the confirmations. Only the
 * selection and the open section persist.
 */

import type { ConversationId } from '@earendil-works/pi-durable';
import { open_view } from '../../kernel/dock/dock.svelte.ts';
import { AuditLog, type AuditRow } from '../../kernel/pi/audit.ts';
import type { BotMeta, DiffEntry } from '../../kernel/pi/bots/meta.ts';
import { botPaths } from '../../kernel/pi/bots/paths.ts';
import { createBot, deleteBot, duplicateBot, setIdentity, updateBot } from '../../kernel/pi/bots/store.ts';
import { resolveDefault } from '../../kernel/pi/models.ts';
import { piModels } from '../../kernel/pi/harness.svelte.ts';
import { botIndex, createSession, index, sessionHarness } from '../../kernel/pi/sessions.svelte.ts';
import { flash } from '../../kernel/status.svelte.ts';
import { persisted } from '../../kernel/storage.svelte.ts';
import { selectSession } from '../agents/session.svelte.ts';
import { draftOf, patchOf, type BotDraft } from './draft.ts';

export type Section = 'identity' | 'character' | 'roles' | 'capabilities' | 'models' | 'memory' | 'activity' | 'json';
export const SECTIONS: { id: Section; label: string }[] = [
	{ id: 'identity', label: 'Identity' },
	{ id: 'character', label: 'Character' },
	{ id: 'roles', label: 'Roles' },
	{ id: 'capabilities', label: 'Capabilities' },
	{ id: 'models', label: 'Models' },
	{ id: 'memory', label: 'Memory' },
	{ id: 'activity', label: 'Activity' },
	{ id: 'json', label: 'JSON' }
];

export const bots_ui = persisted('surface.bots', { selected: '', section: 'character' as string });

export const editor = $state({
	/** The bot the draft belongs to. */
	draftFor: '',
	draft: null as BotDraft | null,
	/** A save under review: the diff `updateBot(..., {dryRun})` computed. */
	preview: null as DiffEntry[] | null,
	/** Unlock state of the identity form. */
	identity: null as { name: string; role: string; mission: string } | null,
	confirmDelete: false,
	error: '',
	/** The line shown after deleting a bot (kept sessions). */
	notice: '',
	audit: [] as AuditRow[],
	/** The memory model picker is open. */
	pickingModel: false,
	busy: false
});

export interface BotView {
	id: string;
	bot: BotMeta;
}

/** Newest first; archived bots last. */
export function botList(): BotView[] {
	return Object.entries(botIndex.bots)
		.map(([id, bot]) => ({ id, bot }))
		.sort((a, b) => Number(a.bot.archived) - Number(b.bot.archived) || b.bot.updatedAt - a.bot.updatedAt || (a.id < b.id ? -1 : 1));
}

export const selectedBot = (): BotView | null => {
	const bot = botIndex.bots[bots_ui.selected];
	return bot ? { id: bots_ui.selected, bot } : null;
};

export const sessionCount = (botId: string) => Object.values(index.sessions).filter((s) => s.botId === botId).length;

function resetEditor() {
	editor.draftFor = '';
	editor.draft = null;
	editor.preview = null;
	editor.identity = null;
	editor.confirmDelete = false;
	editor.error = '';
	editor.pickingModel = false;
	editor.audit = [];
}

/** Keeps the draft in step with the selection and the saved bot (a save elsewhere refreshes a clean draft). */
export function syncDraft() {
	const sel = selectedBot();
	if (!sel) {
		if (editor.draftFor) resetEditor();
		return;
	}
	if (editor.draftFor !== sel.id) {
		resetEditor();
		editor.draftFor = sel.id;
		editor.draft = draftOf(sel.bot);
		return;
	}
	if (editor.draft && !editor.preview && Object.keys(patchOf(sel.bot, editor.draft)).length === 0) editor.draft = draftOf(sel.bot);
}

export const pendingPatch = () => {
	const sel = selectedBot();
	return sel && editor.draft ? patchOf(sel.bot, editor.draft) : {};
};
export const dirty = () => Object.keys(pendingPatch()).length > 0;

export function selectBot(id: string, show = false) {
	bots_ui.selected = id;
	editor.notice = '';
	if (show) open_view('bot-editor');
}

const fail = (err: unknown) => {
	editor.error = (err as Error).message;
	editor.busy = false;
};

/** Save step 1: compute the diff without writing. */
export async function reviewSave() {
	const sel = selectedBot();
	if (!sel || !editor.draft) return;
	editor.error = '';
	try {
		const { diff } = await updateBot(await sessionHarness(), sel.id, pendingPatch(), { dryRun: true });
		editor.preview = diff;
	} catch (err) {
		fail(err);
	}
}

export const cancelReview = () => (editor.preview = null);

/** Save step 2: write exactly what was previewed. */
export async function confirmSave() {
	const sel = selectedBot();
	if (!sel || !editor.draft || !editor.preview) return;
	editor.busy = true;
	try {
		const { bot, diff } = await updateBot(await sessionHarness(), sel.id, pendingPatch());
		botIndex.bots[sel.id] = bot; // the document watcher writes the same row a moment later
		editor.preview = null;
		editor.error = '';
		editor.busy = false;
		flash(`Saved ${sel.bot.identity.name}: ${diff.length} change${diff.length === 1 ? '' : 's'}`, 'success');
		editor.draft = draftOf(bot);
	} catch (err) {
		fail(err);
	}
}

export function revert() {
	const sel = selectedBot();
	if (!sel) return;
	editor.draft = draftOf(sel.bot);
	editor.preview = null;
	editor.error = '';
}

export async function create(name: string, workspace: string): Promise<string | null> {
	editor.error = '';
	try {
		const id = await createBot(await sessionHarness(), { name, ...(workspace.trim() ? { workspace: workspace.trim() } : {}) });
		selectBot(id, true);
		flash(`Created ${name.trim()}`, 'success');
		return id;
	} catch (err) {
		fail(err);
		return null;
	}
}

export async function duplicate(id: string) {
	try {
		const copy = await duplicateBot(await sessionHarness(), id);
		selectBot(copy, true);
		flash('Duplicated', 'success');
	} catch (err) {
		fail(err);
	}
}

/** Delete keeps the bot's sessions as plain sessions and says so. */
export async function remove(id: string) {
	const name = botIndex.bots[id]?.identity.name ?? 'The bot';
	try {
		const { detached } = await deleteBot(await sessionHarness(), id);
		const kept = detached.length;
		editor.notice = kept
			? `Deleted ${name}. Its ${kept} session${kept === 1 ? ' was' : 's were'} kept as plain session${kept === 1 ? '' : 's'}: find them in Sessions and use “Move to bot” to give one to another bot.`
			: `Deleted ${name}. It had no sessions.`;
		flash(editor.notice, 'info', 8000);
		bots_ui.selected = '';
		editor.confirmDelete = false;
		resetEditor();
	} catch (err) {
		fail(err);
	}
}

/** Start a chat with this bot in its botroom (or assigned workspace). */
export async function chatWith(id: string) {
	try {
		const sid = await createSession(null, resolveDefault(piModels()), { botId: id });
		await selectSession(String(sid as ConversationId));
		open_view('chat');
	} catch (err) {
		fail(err);
	}
}

export async function applyIdentity() {
	const sel = selectedBot();
	if (!sel || !editor.identity) return;
	try {
		const { diff } = await setIdentity(await sessionHarness(), sel.id, editor.identity, true);
		editor.identity = null;
		flash(diff.length ? 'Identity changed' : 'No identity change', 'success');
	} catch (err) {
		fail(err);
	}
}

export function loadActivity() {
	const sel = selectedBot();
	if (!sel) return;
	try {
		editor.audit = new AuditLog(botPaths(sel.id).audit).read().slice(-60).reverse();
	} catch (err) {
		editor.audit = [];
		editor.error = `Could not read the activity log: ${(err as Error).message}`;
	}
}
