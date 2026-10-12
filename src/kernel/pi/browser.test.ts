import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserController, loadPlaywright, playwrightAvailable, urlProblem, type PwLoader } from './browser.ts';
import { MAX_RESULT_CHARS } from './caps.ts';

const root = mkdtempSync(join(tmpdir(), 'fractalgpui-browser-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** TEST DOUBLE for Playwright: a page that records what was asked of it. */
function fakeLoader(calls: string[], opts: { text?: string } = {}): PwLoader {
	let url = 'about:blank';
	const page = {
		goto: async (u: string) => void calls.push(`goto ${u}`, (url = u)),
		url: () => url,
		title: async () => 'Fake page',
		screenshot: async (o: { path: string }) => void writeFileSync(o.path, Buffer.from([0xff, 0xd8, 0xff, 0xd9])),
		locator: (sel: string) => ({
			ariaSnapshot: async () => opts.text ?? `- heading "Hello" (${sel})`,
			innerText: async () => opts.text ?? 'Hello world',
			click: async () => void calls.push(`click ${sel}`),
			fill: async (v: string) => void calls.push(`fill ${sel} ${v}`),
			press: async (k: string) => void calls.push(`press ${k}`)
		}),
		getByText: (t: string) => ({ first: () => ({ click: async () => void calls.push(`clicktext ${t}`) }) }),
		on: () => {},
		bringToFront: async () => {},
		waitForLoadState: async () => {}
	};
	return async () => ({
		chromium: {
			launchPersistentContext: async (dir: string, o: object) => {
				calls.push(`launch ${dir} ${JSON.stringify((o as { headless: boolean }).headless)}`);
				return { pages: () => [page], newPage: async () => page, close: async () => void calls.push('close'), on: () => {} };
			}
		}
	});
}

const mk = (calls: string[], extra: Partial<ConstructorParameters<typeof BrowserController>[0]> = {}, loaderOpts = {}) =>
	new BrowserController({ profileDir: join(root, 'profile'), mediaDir: join(root, 'media'), loader: fakeLoader(calls, loaderOpts), ...extra });

describe('url policy', () => {
	test('only http(s) pages', () => {
		expect(urlProblem('https://example.com/a')).toBeNull();
		expect(urlProblem('http://localhost:3000')).toBeNull();
		expect(urlProblem('file:///etc/passwd')).toMatch(/Only http/);
		expect(urlProblem('javascript:alert(1)')).toMatch(/Only http/);
		expect(urlProblem('data:text/html,hi')).toMatch(/Only http/);
		expect(urlProblem('example.com')).toMatch(/full URL/);
	});
});

describe('BrowserController (fake Playwright)', () => {
	test('lazy: nothing launches until used; persistent profile dir; headless by default', async () => {
		const calls: string[] = [];
		const b = mk(calls);
		expect(b.state.status).toBe('closed');
		expect(calls).toEqual([]);
		await b.navigate('https://example.com');
		expect(calls[0]).toBe(`launch ${join(root, 'profile')} true`);
		expect(b.state.status).toBe('open');
		expect(b.state.url).toBe('https://example.com');
		expect(b.state.title).toBe('Fake page');
		await b.close();
		expect(b.state.status).toBe('closed');
	});

	test('headed option launches a visible window; relaunch switches mode and keeps the profile', async () => {
		const calls: string[] = [];
		const b = mk(calls, { headed: true });
		await b.ensure();
		expect(calls[0]).toMatch(/ false$/);
		await b.relaunch(false);
		expect(calls.filter((c) => c.startsWith('launch')).map((c) => c.split(' ')[1])).toEqual([join(root, 'profile'), join(root, 'profile')]);
		expect(calls.at(-1)).toMatch(/ true$/);
		await b.close();
	});

	test('refuses non-web URLs without launching or navigating, and logs it', async () => {
		const calls: string[] = [];
		const b = mk(calls);
		await expect(b.navigate('file:///etc/hosts')).rejects.toThrow(/Only http/);
		expect(calls).toEqual([]);
		expect(b.state.log.at(-1)).toMatchObject({ action: 'navigate', ok: false });
	});

	test('screenshot is a file path in the media folder, never bytes', async () => {
		const calls: string[] = [];
		const b = mk(calls, {}, {});
		const s = await b.screenshot();
		expect(s.path.startsWith(join(root, 'media'))).toBe(true);
		expect(existsSync(s.path)).toBe(true);
		expect(s.bytes).toBe(statSync(s.path).size);
		expect(b.state.lastShot).toBe(s.path);
		// the controller's state, which the UI and logs read, contains no image payload
		expect(JSON.stringify(b.state)).not.toMatch(/base64|data:image/);
		await b.close();
	});

	test('click / type / extract / snapshot act and are logged; results are capped at 32k', async () => {
		const calls: string[] = [];
		const b = mk(calls, {}, { text: 'x\n'.repeat(40_000) });
		await b.click({ selector: '#go' });
		await b.click({ text: 'Sign in' });
		await b.type('#q', 'hello', true);
		const text = await b.extractText();
		const snap = await b.snapshot('main');
		for (const c of ['click #go', 'clicktext Sign in', 'fill #q hello', 'press Enter']) expect(calls.includes(c)).toBe(true);
		expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS + 200);
		expect(text).toMatch(/truncated/);
		expect(snap.length).toBeLessThanOrEqual(MAX_RESULT_CHARS + 200);
		const acts = b.state.log.map((l) => l.action);
		for (const a of ['launch', 'click', 'type', 'extract', 'snapshot']) expect(acts.includes(a)).toBe(true);
		await expect(b.click({})).rejects.toThrow(/selector or text/);
		await b.close();
	});

	test('a missing Playwright is a clear, non-fatal error', async () => {
		const prev = process.env.FRACTALGPUI_PLAYWRIGHT_DIR;
		process.env.FRACTALGPUI_PLAYWRIGHT_DIR = join(root, 'nowhere');
		try {
			const b = new BrowserController({ profileDir: join(root, 'p2'), mediaDir: join(root, 'm2') });
			// only meaningful when the app itself does not bundle playwright
			if (!(await playwrightAvailable(loadPlaywright))) {
				await expect(b.navigate('https://example.com')).rejects.toThrow(/Playwright is not installed/);
				expect(b.state.status).toBe('error');
				expect(b.state.error).toMatch(/Install browser|npm install playwright/);
			}
		} finally {
			if (prev === undefined) delete process.env.FRACTALGPUI_PLAYWRIGHT_DIR;
			else process.env.FRACTALGPUI_PLAYWRIGHT_DIR = prev;
		}
	});
});

// Real Chromium against a local page. Skipped (not failed) when Playwright or its browser is not installed.
const real = await (async () => {
	try {
		const pw = await loadPlaywright();
		const exe = (pw.chromium as unknown as { executablePath?: () => string }).executablePath?.();
		return !!exe && existsSync(exe);
	} catch {
		return false;
	}
})();

if (real) describe('real Chromium (headless, local page)', () => {
	test('navigate, snapshot, type, click, screenshot, persistent profile', async () => {
		const server = createServer((_req, res) => {
			res.setHeader('content-type', 'text/html');
			res.end('<title>Local</title><h1>Hi bot</h1><input id=q><button id=b onclick="document.title=document.getElementById(\'q\').value">Go</button>');
		});
		await new Promise<void>((r) => server.listen(0, r));
		const port = (server.address() as { port: number }).port;
		const b = new BrowserController({ profileDir: join(root, 'real-profile'), mediaDir: join(root, 'real-media') });
		try {
			const url = `http://localhost:${port}/`;
			const r = await b.navigate(url);
			expect(r.title).toBe('Local');
			expect(await b.extractText()).toContain('Hi bot');
			expect(await b.snapshot()).toContain('Hi bot');
			await b.type('#q', 'typed');
			await b.click({ selector: '#b' });
			expect(b.state.title).toBe('typed');
			const s = await b.screenshot();
			expect(readFileSync(s.path).subarray(0, 2).toString('hex')).toBe('ffd8');
		} finally {
			await b.close();
			server.close();
		}
		expect(existsSync(join(root, 'real-profile'))).toBe(true);
	});
});
