import { data_dir } from '../../paths.ts';
import { BrowserController, type BrowserOptions } from '../browser.ts';
import { botPaths, ensureBotFolders } from './paths.ts';

/** One controller per bot (lazy; nothing launches until a tool or the Browser view asks). */
const controllers = new Map<string, BrowserController>();

/** Seams: tests replace the loader; the app sets the persisted window-mode lookup. */
export const browserRuntime: { root?: string; loader?: BrowserOptions['loader']; headed: (botId: string) => boolean } = {
	headed: () => false
};

export function browserFor(botId: string): BrowserController {
	const root = browserRuntime.root ?? data_dir();
	const key = `${root}\0${botId}`;
	let c = controllers.get(key);
	if (!c) {
		const p = ensureBotFolders(botId, root);
		c = new BrowserController({ profileDir: p.browserProfile, mediaDir: p.media, headed: browserRuntime.headed(botId), loader: browserRuntime.loader });
		controllers.set(key, c);
	}
	return c;
}

export const hasBrowser = (botId: string) => controllers.has(`${browserRuntime.root ?? data_dir()}\0${botId}`);

export async function closeBrowsers(): Promise<void> {
	await Promise.all([...controllers.values()].map((c) => c.close()));
	controllers.clear();
}

export const mediaDirOf = (botId: string) => botPaths(botId, browserRuntime.root ?? data_dir()).media;
