import '../../../test/harness.ts';
import { check, click_test_id, find_test_id, finish, focus, mount_headless, painted, settle, type } from 'gpuix-svelte/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load_styles } from '../../../build/styles.ts';
import App from '../../App.svelte';
import { open_view } from '../../kernel/dock/dock.svelte.ts';
import { browserRuntime } from '../../kernel/pi/bots/browsers.ts';
import { createBot } from '../../kernel/pi/bots/store.ts';
import { sessionHarness } from '../../kernel/pi/sessions.svelte.ts';
import { botList, bots_ui } from '../bots/state.svelte.ts';
import { ensureActive } from '../agents/session.svelte.ts';
import { browser_prefs, browser_ui } from './state.svelte.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 8000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		settle();
		if (cond()) return true;
		await sleep(40);
	}
	return cond();
}

const calls: string[] = [];
// TEST DOUBLE for Playwright: records what it is asked and writes a tiny JPEG for screenshots.
browserRuntime.loader = async () => {
	let url = 'about:blank';
	const page = {
		goto: async (u: string) => void (calls.push(`goto ${u}`), (url = u)),
		url: () => url,
		title: async () => 'Fake page',
		screenshot: async (o: { path: string }) => writeFileSync(o.path, Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
		locator: () => ({ ariaSnapshot: async () => '', innerText: async () => '', click: async () => {}, fill: async () => {}, press: async () => {} }),
		getByText: () => ({ first: () => ({ click: async () => {} }) }),
		on: () => {},
		bringToFront: async () => {},
		waitForLoadState: async () => {}
	};
	return {
		chromium: {
			launchPersistentContext: async (_d: string, o: object) => {
				calls.push(`launch headless=${(o as { headless: boolean }).headless}`);
				return { pages: () => [page], newPage: async () => page, close: async () => {}, on: () => {} };
			}
		}
	};
};

load_styles();
mount_headless(App, { width: 1400, height: 900 });
settle();
await ensureActive();
const tmp = mkdtempSync(join(tmpdir(), 'fractalgpui-br-'));

open_view('browser');
check('with no bot the view says to create one', await until(() => !!find_test_id('br-nobot')), true);

const id = await createBot(await sessionHarness(), { name: 'Surfer' });
bots_ui.selected = id;
check('with a bot the view shows its status, closed', await until(() => !!find_test_id('br-status') && painted().includes('closed')), true);
check('nothing launched yet (lazy)', calls.length, 0);
check('Playwright is reported as present (the double) so no install prompt', !find_test_id('br-missing'), true);

click_test_id('br-headed');
check('the visible-window switch is stored per bot', browser_prefs.headed[id], true);
click_test_id('br-launch');
check('Launch opens the browser in a visible window', await until(() => calls.includes('launch headless=false')), true);
check('status shows open and visible', await until(() => painted().includes('visible window')), true);

const url = find_test_id('br-url');
if (url) focus(url);
type('h t t p s : / / e x a m p l e . c o m');
click_test_id('br-go');
check('Go navigates', await until(() => calls.includes('goto https://example.com')), true);
check('the title is shown', await until(() => painted().includes('Fake page')), true);
check('the action log lists the navigation', await until(() => !!find_test_id('br-log-0')), true);

click_test_id('br-shot');
check('Screenshot shows the saved file path (a file, not bytes)', await until(() => !!find_test_id('br-shot-path') && painted().includes('media')), true);
check('the picture element is mounted from the path', !!find_test_id('br-image'), true);

browser_ui.url = 'file:///etc/hosts';
click_test_id('br-go');
check('a non-web URL is refused with a message', await until(() => !!find_test_id('br-error')), true);

click_test_id('br-close');
check('Close returns to closed', await until(() => painted().includes('closed')), true);
check('the bot exists in the list', botList().length, 1);

rmSync(tmp, { recursive: true, force: true });
finish('browser', 15);
