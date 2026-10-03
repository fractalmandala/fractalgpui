/**
 * Reads fractalstyler from its *source* (`src/lib/styles`), never `dist` (which is a
 * stale build), and never writes to it. fractalstyler is an independent package
 * under active refactor, so compiling is defensive:
 *
 *   1. its own `index.sass` (the master composition contract), else
 *   2. a synthesized entry that `@use`s every `_NN_*.sass` partial in numeric order
 *      (survives a half-renamed index), else
 *   3. each partial on its own, skipping the ones that fail.
 *
 * Every fallback is reported, so a broken partial shows up as a warning and in the
 * strict style check rather than as a blank window.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, compileString } from 'sass';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Override with FRACTALSTYLER_STYLES=/path/to/styles. */
export const FRACTALSTYLER_STYLES = process.env.FRACTALSTYLER_STYLES ?? resolve(APP_ROOT, '../../packages/fractalstyler/src/lib/styles');

export interface FractalstylerBuild {
	dir: string;
	mode: 'index' | 'partials' | 'per-partial';
	/** One entry per compiled unit, in cascade order. */
	sheets: { source: string; css: string }[];
	warnings: string[];
}

const PARTIAL = /^_(\d+)_([\w-]+)\.s[ac]ss$/;

export function list_partials(dir = FRACTALSTYLER_STYLES): string[] {
	return readdirSync(dir)
		.filter((f) => PARTIAL.test(f))
		.sort((a, b) => Number(PARTIAL.exec(a)![1]) - Number(PARTIAL.exec(b)![1]) || a.localeCompare(b));
}

const silent = { warn() {}, debug() {} };

export function compile_fractalstyler(dir = FRACTALSTYLER_STYLES): FractalstylerBuild {
	const warnings: string[] = [];
	if (!existsSync(dir)) {
		return { dir, mode: 'per-partial', sheets: [], warnings: [`fractalstyler styles not found at ${dir} (set FRACTALSTYLER_STYLES)`] };
	}

	const options = { style: 'expanded' as const, charset: false, loadPaths: [dir], logger: silent };
	const index = join(dir, 'index.sass');
	if (existsSync(index)) {
		try {
			return { dir, mode: 'index', sheets: [{ source: 'fractalstyler/index.sass', css: compile(index, options).css }], warnings };
		} catch (err) {
			warnings.push(`fractalstyler index.sass does not compile (${first_line(err)}); using its partials directly`);
		}
	}

	const partials = list_partials(dir);
	const entry = partials.map((f) => `@use '${f.replace(/^_/, '').replace(/\.s[ac]ss$/, '')}' as *`).join('\n');
	try {
		return { dir, mode: 'partials', sheets: [{ source: 'fractalstyler/partials', css: compileString(entry, { ...options, syntax: 'indented' }).css }], warnings };
	} catch (err) {
		warnings.push(`fractalstyler partials do not compile together (${first_line(err)}); compiling each on its own`);
	}

	const sheets: FractalstylerBuild['sheets'] = [];
	for (const f of partials) {
		try {
			sheets.push({ source: `fractalstyler/${f}`, css: compile(join(dir, f), options).css });
		} catch (err) {
			warnings.push(`fractalstyler/${f} skipped: ${first_line(err)}`);
		}
	}
	return { dir, mode: 'per-partial', sheets, warnings };
}

function first_line(err: unknown) {
	return String((err as Error).message ?? err).split('\n')[0];
}
