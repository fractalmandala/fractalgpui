import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { data_dir } from '../../paths.ts';
import { slugify } from './meta.ts';

/**
 * On-disk layout.
 *   <data_dir>/botroom/<slug>/        default workspace of a bot (created with the bot)
 *   <data_dir>/bots/<id>/audit.jsonl  append-only audit log
 *                       memory.sqlite temporal memory
 *                       browser-profile/ persistent browser profile
 *                       media/        screenshots and other files the bot makes
 *                       avatar.*      user-chosen avatar copy (optional)
 * `root` defaults to the app data dir; tests pass a temp dir.
 */

export interface BotPaths {
	home: string;
	audit: string;
	memory: string;
	browserProfile: string;
	media: string;
}

export const botroomRoot = (root = data_dir()) => join(root, 'botroom');
export const botsRoot = (root = data_dir()) => join(root, 'bots');

export function botPaths(id: string, root = data_dir()): BotPaths {
	const home = join(botsRoot(root), id);
	return { home, audit: join(home, 'audit.jsonl'), memory: join(home, 'memory.sqlite'), browserProfile: join(home, 'browser-profile'), media: join(home, 'media') };
}

/** Create the per-bot folders (idempotent). */
export function ensureBotFolders(id: string, root = data_dir()): BotPaths {
	const p = botPaths(id, root);
	for (const d of [p.home, p.browserProfile, p.media]) mkdirSync(d, { recursive: true });
	return p;
}

/** Create a fresh botroom folder for a bot; a slug collision gets the id suffix appended. */
export function createBotroom(id: string, name: string, root = data_dir()): string {
	const base = botroomRoot(root);
	mkdirSync(base, { recursive: true });
	const slug = slugify(name);
	let dir = join(base, slug);
	if (existsSync(dir)) dir = join(base, `${slug}-${id.replace(/^bot_/, '').slice(0, 6)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}
