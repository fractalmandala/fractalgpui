/**
 * The Bot editor's working copy, UI-free. The editor never writes while you type: it edits a
 * `BotDraft` (everything as plain text or booleans, the way inputs deliver them), `patchOf`
 * turns the difference to the saved bot into a `BotPatch`, and Save previews that patch with
 * `updateBot(..., {dryRun})` before it confirms. The identity is not here: it is locked.
 */

import type { Capabilities, BotMeta, MemoryConfig } from '../../kernel/pi/bots/meta.ts';
import type { BotPatch } from '../../kernel/pi/bots/store.ts';

export interface BotDraft {
	tone: string;
	verbosity: string;
	/** Comma-separated. */
	traits: string;
	addressUserAs: string;
	notes: string;
	/** Comma-separated role ids. */
	roles: string;
	capabilities: Capabilities;
	memory: MemoryConfig;
	/** Folder path; empty = the bot's botroom. */
	workspace: string;
	/** Image path; empty = the generated avatar. */
	avatar: string;
}

export const splitList = (text: string): string[] => [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];

export function draftOf(bot: BotMeta): BotDraft {
	return {
		tone: bot.character.tone,
		verbosity: bot.character.verbosity,
		traits: bot.character.traits.join(', '),
		addressUserAs: bot.character.addressUserAs,
		notes: bot.character.notes,
		roles: bot.roles.join(', '),
		capabilities: { ...bot.capabilities },
		memory: { ...bot.memory },
		workspace: bot.workspaceIsBotroom ? '' : bot.workspace,
		avatar: bot.avatar ?? ''
	};
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only what differs from `bot`; `{}` = nothing to save. */
export function patchOf(bot: BotMeta, d: BotDraft): BotPatch {
	const base = draftOf(bot);
	const patch: BotPatch = {};
	const character: Partial<BotMeta['character']> = {};
	if (d.tone !== base.tone) character.tone = d.tone;
	if (d.verbosity !== base.verbosity) character.verbosity = d.verbosity;
	if (!same(splitList(d.traits), bot.character.traits)) character.traits = splitList(d.traits);
	if (d.addressUserAs !== base.addressUserAs) character.addressUserAs = d.addressUserAs.trim();
	if (d.notes !== base.notes) character.notes = d.notes;
	if (Object.keys(character).length) patch.character = character;
	if (!same(splitList(d.roles), bot.roles)) patch.roles = splitList(d.roles);
	if (!same(d.capabilities, base.capabilities)) patch.capabilities = { ...d.capabilities };
	if (!same(d.memory, base.memory)) patch.memory = { ...d.memory };
	if (d.workspace.trim() !== base.workspace) patch.workspace = d.workspace.trim() || null;
	if (d.avatar.trim() !== base.avatar) patch.avatar = d.avatar.trim() || null;
	return patch;
}

export const isDirty = (bot: BotMeta, d: BotDraft) => Object.keys(patchOf(bot, d)).length > 0;

/** A whole-number input: junk or negatives keep the previous value. */
export function wholeNumber(text: string, previous: number, min = 0): number {
	const n = Number(text.trim());
	return Number.isInteger(n) && n >= min ? n : previous;
}

/** How a diff value reads in the preview. */
export function showValue(v: unknown): string {
	if (v === undefined) return '(none)';
	if (typeof v === 'string') return v === '' ? '(empty)' : v.length > 60 ? `${v.slice(0, 57)}…` : v;
	const s = JSON.stringify(v);
	return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

/** `provider/modelId` → parts (the model id may itself contain slashes). */
export function splitModel(ref: string): { provider: string; modelId: string } | null {
	const at = ref.indexOf('/');
	return at > 0 && at < ref.length - 1 ? { provider: ref.slice(0, at), modelId: ref.slice(at + 1) } : null;
}
