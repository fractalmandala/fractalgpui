import { defineDoc, type SessionDocToken } from '@earendil-works/pi-durable';
import { validate } from './schema.ts';
import { PERSONALITY_SCHEMA } from './personality-schema.ts';

/**
 * Bots: long-lived identities that own many sessions. The `fractal.bots` document is a
 * session-scoped singleton next to `fractal.sessions`; a session joins a bot through
 * `SessionMeta.botId`. Everything a prompt needs (identity, character, capabilities,
 * profile, memory posture) lives here, so editing a bot affects all of its sessions.
 *
 * Chord strict-JSON rejects explicit `undefined`: optional keys are omitted, never set to undefined.
 */

/** Bumped when the shape of `BotMeta` changes; `upgradeBot` migrates older rows on read. */
export const BOT_SCHEMA_VERSION = 1;

/** Locked after creation: only `setIdentity(..., confirm=true)` changes it. */
export type Identity = { name: string; role: string; mission: string; createdAt: number };
/** Editable by the user any time and by the agent via `character_edit` (if allowed). */
export type Character = { tone: string; verbosity: string; traits: string[]; addressUserAs: string; notes: string };
/** Tool toggles (shell = bash; fileWrite = write/edit; browser = browser_* tools). */
export type Capabilities = { shell: boolean; fileWrite: boolean; browser: boolean; agentEditsCharacter: boolean };
export type MemoryConfig = {
	viewBudgetChars: number;
	keepRecent: number;
	fan: number;
	/** `provider/modelId`; empty = the session's own model. */
	summaryModel: string;
	profileCapBytes: number;
	agentMayCommitProfile: boolean;
};

export type Actor = 'user' | 'agent';
export type ProfileEntry = { key: string; text: string; ts: number; by: Actor };
export type Proposal = { id: number; key: string; text: string; reason: string; ts: number };
export type Profile = { entries: ProfileEntry[]; proposals: Proposal[]; nextId: number };

export type BotMeta = {
	schema: number;
	identity: Identity;
	character: Character;
	capabilities: Capabilities;
	memory: MemoryConfig;
	profile: Profile;
	/** Absolute path of a user-chosen avatar image; omitted = the generated fallback (`avatarFallback`). */
	avatar?: string;
	/** Role ids into the roles catalog (`catalog.ts`). */
	roles: string[];
	/** Ids of installed Agent Plugins enabled for this bot; absent on older rows = none. */
	plugins?: string[];
	/** Default workspace: the bot's botroom folder unless assigned. */
	workspace: string;
	/** True when `workspace` is the auto-created botroom folder. */
	workspaceIsBotroom: boolean;
	createdAt: number;
	updatedAt: number;
	archived: boolean;
};

export type BotsIndex = { bots: Record<string, BotMeta> };

export const BotsDoc: SessionDocToken<BotsIndex> = defineDoc({
	kind: 'fractal.bots',
	version: 1,
	scope: 'session',
	initial: () => ({ bots: {} })
});

export const DEFAULT_CHARACTER = (): Character => ({ tone: 'neutral', verbosity: 'normal', traits: [], addressUserAs: '', notes: '' });
export const DEFAULT_CAPABILITIES = (): Capabilities => ({ shell: true, fileWrite: true, browser: true, agentEditsCharacter: true });
export const DEFAULT_MEMORY = (): MemoryConfig => ({
	viewBudgetChars: 8000,
	keepRecent: 12,
	fan: 6,
	summaryModel: '',
	profileCapBytes: 2000,
	agentMayCommitProfile: false
});
export const DEFAULT_ROLE = 'personal assistant running locally on your computer';
export const DEFAULT_MISSION = 'Help the user get things done on their machine and the web, carefully and transparently.';

export type NewBotInput = {
	name: string;
	role?: string;
	mission?: string;
	character?: Partial<Character>;
	capabilities?: Partial<Capabilities>;
	memory?: Partial<MemoryConfig>;
	avatar?: string;
	roles?: string[];
	/** Assign a workspace folder; omitted = the botroom folder. */
	workspace?: string;
};

/** The shape `personality.schema` validates (identity, character, capabilities, memory). */
export function personalityView(b: BotMeta) {
	return { version: 1, created: true, identity: b.identity, character: b.character, capabilities: b.capabilities, memory: b.memory };
}

/** Schema errors for a bot's personality part; empty = valid. */
export function validateBot(b: BotMeta): string[] {
	const errs = validate(PERSONALITY_SCHEMA, personalityView(b));
	if (b.roles.some((r) => typeof r !== 'string' || !r)) errs.push('$.roles: must be a list of non-empty strings');
	if (b.plugins && b.plugins.some((r) => typeof r !== 'string' || !r)) errs.push('$.plugins: must be a list of non-empty strings');
	if (!b.workspace.startsWith('/')) errs.push('$.workspace: must be an absolute path');
	return errs;
}

export function assertValid(b: BotMeta): void {
	const errs = validateBot(b);
	if (errs.length) throw new Error(`Invalid bot: ${errs.slice(0, 4).join('; ')}`);
}

/** Migrate an older stored row to the current schema (no-op today: version 1 is the first). */
export function upgradeBot(b: BotMeta): BotMeta {
	return b.schema === BOT_SCHEMA_VERSION ? b : { ...b, schema: BOT_SCHEMA_VERSION };
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** `bot_` + 10 random base36 characters (crypto-random). */
export function newBotId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	let s = '';
	for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
	return `bot_${s}`;
}

export function slugify(name: string): string {
	const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
	return s || 'bot';
}

/** Generated avatar when no image is set: deterministic from the id and name (a hue and an initial). */
export type AvatarFallback = { initial: string; hue: number; background: string; foreground: string };
export function avatarFallback(id: string, name: string): AvatarFallback {
	let h = 2166136261;
	for (const c of `${id}:${name}`) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
	const hue = h % 360;
	const initial = (Array.from(name.trim())[0] ?? '?').toUpperCase();
	return { initial, hue, background: `hsl(${hue} 45% 38%)`, foreground: 'hsl(0 0% 98%)' };
}

export type DiffEntry = { path: string; before: unknown; after: unknown };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Leaf-level differences between two plain values, as dotted paths. Arrays compare whole. */
export function diffValues(before: unknown, after: unknown, path = ''): DiffEntry[] {
	const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
	if (isObj(before) && isObj(after)) {
		const out: DiffEntry[] = [];
		for (const k of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
			out.push(...diffValues(before[k], after[k], path ? `${path}.${k}` : k));
		}
		return out;
	}
	return same(before, after) ? [] : [{ path, before, after }];
}
