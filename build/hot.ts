/**
 * Hot reload that understands Sass and fractalstyler. gpuix-svelte's own `render_hot`
 * only watches `.svelte` files; this one also rebuilds the styles (app + fractalstyler
 * src, which Amrit edits in parallel) before the remount.
 */

import { watch } from 'node:fs';
import { render, type RenderOptions } from 'gpuix-svelte';
import { FRACTALSTYLER_STYLES } from './fractalstyler.ts';
import { APP_SRC, load_styles } from './styles.ts';

export async function render_hot(entry: URL, options: RenderOptions = {}): Promise<void> {
	let version = 0;
	const load = async () => (await import(`${entry.href}?v=${++version}`)).default;

	load_styles();
	render(await load(), options);

	let timer: ReturnType<typeof setTimeout> | undefined;
	const stale = new Set<string>();

	const reload = () => {
		// Editors write in bursts; coalesce them.
		clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				load_styles();
				render(await load(), options);
			} catch (err) {
				console.error('[fractalgpui] reload failed:', (err as Error).message);
			}
		}, 60);
	};

	watch(APP_SRC, { recursive: true }, (_event, file) => {
		if (!file || file.includes('node_modules')) return;
		// Plain modules (state included) load once per process; an edit needs a restart.
		if (/\.[jt]s$/.test(file)) {
			if (!stale.has(file)) {
				stale.add(file);
				console.warn(`[fractalgpui] ${file} changed; modules load once per process, restart to pick it up`);
			}
			return;
		}
		if (/\.(svelte|sass|scss)$/.test(file)) reload();
	});

	try {
		watch(FRACTALSTYLER_STYLES, { recursive: true }, (_event, file) => {
			if (file && /\.(sass|scss)$/.test(file)) reload();
		});
	} catch {
		console.warn(`[fractalgpui] not watching fractalstyler (${FRACTALSTYLER_STYLES} missing)`);
	}
}

