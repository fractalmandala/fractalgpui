/**
 * The Browser view's state: which bot's browser is shown, a reactive mirror of its controller
 * (URL, status, last screenshot path, action log), and the lazy Playwright install. Nothing launches
 * until you press Launch or a bot's tool asks.
 */
import { botList, bots_ui } from '../bots/state.svelte.ts';
import { browserFor, browserRuntime } from '../../kernel/pi/bots/browsers.ts';
import { installPlaywright, loadPlaywright, playwrightAvailable, type BrowserState } from '../../kernel/pi/browser.ts';
import { persisted } from '../../kernel/storage.svelte.ts';
import { flash } from '../../kernel/status.svelte.ts';

/** Per-bot window mode (visible window vs headless). Persisted; read when a bot's browser is first created. */
export const browser_prefs = persisted('surface.browser', { headed: {} as Record<string, boolean> });
browserRuntime.headed = (id) => browser_prefs.headed[id] === true;

const BLANK: BrowserState = { status: 'closed', headed: false, url: '', title: '', lastShot: '', error: '', log: [] };

export const browser_ui = $state({
	botId: '',
	state: { ...BLANK } as BrowserState,
	url: '',
	/** 'unknown' until checked. */
	playwright: 'unknown' as 'unknown' | 'yes' | 'no',
	installing: false,
	installLog: [] as string[],
	notice: ''
});

/** The bot shown: the Bots selection, else the first bot. */
export const shownBot = (): string => (botList().some((b) => b.id === bots_ui.selected) ? bots_ui.selected : (botList()[0]?.id ?? ''));

let unsub: (() => void) | null = null;

/** Point the view at a bot's controller (idempotent). */
export function attach(botId: string) {
	if (browser_ui.botId === botId) return;
	unsub?.();
	unsub = null;
	browser_ui.botId = botId;
	browser_ui.notice = '';
	if (!botId) {
		browser_ui.state = { ...BLANK };
		return;
	}
	const c = browserFor(botId);
	browser_ui.state = c.state;
	browser_ui.url = c.state.url;
	unsub = c.subscribe((s) => {
		browser_ui.state = s;
		if (s.url) browser_ui.url = s.url;
	});
}

export async function checkPlaywright() {
	browser_ui.playwright = (await playwrightAvailable(browserRuntime.loader ?? loadPlaywright)) ? 'yes' : 'no';
}

export async function install() {
	if (browser_ui.installing) return;
	browser_ui.installing = true;
	browser_ui.installLog = [];
	try {
		await installPlaywright((l) => (browser_ui.installLog = [...browser_ui.installLog, l].slice(-8)));
		flash('Browser installed', 'success');
	} catch (err) {
		flash(`Install failed: ${(err as Error).message}`, 'danger', 8000);
		browser_ui.notice = `Install failed: ${(err as Error).message}`;
	} finally {
		browser_ui.installing = false;
		await checkPlaywright();
	}
}

async function guarded(fn: () => Promise<unknown>) {
	browser_ui.notice = '';
	try {
		await fn();
	} catch (err) {
		browser_ui.notice = (err as Error).message;
	}
}

export const launch = () => guarded(() => browserFor(browser_ui.botId).ensure());
export const close = () => guarded(() => browserFor(browser_ui.botId).close());
export const go = () => guarded(() => browserFor(browser_ui.botId).navigate(browser_ui.url.trim()));
export const shot = () => guarded(() => browserFor(browser_ui.botId).screenshot());

/** Switch between a visible window and headless. Takes effect now when the browser is open (profile kept). */
export async function setHeaded(on: boolean) {
	const id = browser_ui.botId;
	if (!id) return;
	browser_prefs.headed = { ...browser_prefs.headed, [id]: on };
	const c = browserFor(id);
	if (c.state.status === 'open') await guarded(() => c.relaunch(on));
	else c.setHeaded(on);
}
