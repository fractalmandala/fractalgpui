/**
 * Settings persistence: one JSON file (`settings.json` in `data_dir()`), one slot per
 * key. `persisted(key, defaults)` returns a deeply reactive `$state` object seeded
 * from disk; any change to any slot schedules a debounced, atomic write
 * (tmp file + rename). Pending writes are flushed on exit.
 *
 * Loading is forgiving: unknown keys are ignored, values whose type differs from
 * the default are dropped, and a corrupt file is moved aside rather than lost.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { data_dir } from './paths.ts';

export const SETTINGS_VERSION = 1;
export const DEBOUNCE_MS = 400;

type Json = Record<string, unknown>;

export const settings_file = () => join(data_dir(), 'settings.json');

function read_file(): Json {
	const file = settings_file();
	if (!existsSync(file)) return {};
	try {
		const parsed = JSON.parse(readFileSync(file, 'utf8'));
		return parsed && typeof parsed === 'object' && parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : {};
	} catch (err) {
		const aside = `${file}.corrupt-${Date.now()}`;
		try {
			renameSync(file, aside);
		} catch {
			// nothing to do: we just won't overwrite what we can't move
		}
		console.warn(`[fractalgpui] settings.json was unreadable (${(err as Error).message}); moved to ${aside}`);
		return {};
	}
}

const stored = read_file();
const slots = new Map<string, object>();
let timer: ReturnType<typeof setTimeout> | null = null;
let writes = 0;

/** Keeps only stored values whose type matches the default's. */
function merge<T extends Json>(defaults: T, saved: unknown): T {
	const out = { ...defaults };
	if (!saved || typeof saved !== 'object') return out;
	for (const key of Object.keys(defaults) as (keyof T)[]) {
		const value = (saved as Json)[key as string];
		const want = defaults[key];
		if (value === undefined) continue;
		if (Array.isArray(want) ? Array.isArray(value) : typeof value === typeof want && (want === null || !Array.isArray(value))) {
			out[key] = value as T[keyof T];
		}
	}
	return out;
}

export function persisted<T extends Json>(key: string, defaults: T): T {
	if (slots.has(key)) throw new Error(`[fractalgpui] persisted("${key}") registered twice`);
	const state = $state(merge(defaults, stored[key]));
	slots.set(key, state);

	// Outside any component, so it lives for the whole process.
	$effect.root(() => {
		let first = true;
		$effect(() => {
			JSON.stringify(state); // read everything, deeply
			if (first) {
				first = false;
				return;
			}
			schedule();
		});
	});

	return state;
}

export function schedule() {
	if (timer) clearTimeout(timer);
	timer = setTimeout(flush, DEBOUNCE_MS);
}

export const pending = () => timer !== null;
export const write_count = () => writes;

/** Writes now (and cancels a scheduled write). */
export function flush() {
	if (timer) clearTimeout(timer);
	timer = null;
	const dir = data_dir();
	const file = settings_file();
	const body = JSON.stringify({ version: SETTINGS_VERSION, slots: { ...stored, ...Object.fromEntries(slots) } }, null, '\t');
	try {
		mkdirSync(dir, { recursive: true });
		const tmp = `${file}.tmp`;
		writeFileSync(tmp, body);
		renameSync(tmp, file);
		writes++;
	} catch (err) {
		console.error(`[fractalgpui] could not save settings: ${(err as Error).message}`);
	}
}

process.on('exit', () => {
	if (timer) flush();
});
