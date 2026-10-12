// A bot's browser: Playwright with a persistent per-bot profile. Playwright is OPTIONAL and loaded lazily:
// the app starts without it, and the first use reports exactly how to install it (or installs it on request).
// Nothing here stores image bytes anywhere but files in the bot's media folder; callers only ever see paths.
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { data_dir } from '../paths.ts';
import { capText, MAX_RESULT_CHARS } from './caps.ts';

export const PLAYWRIGHT_VERSION = '1.64.0';

/** Where a lazy install goes (and where `loadPlaywright` looks after the app's own node_modules). */
export const playwrightDir = (root = data_dir()) => process.env.FRACTALGPUI_PLAYWRIGHT_DIR || join(root, 'playwright');

// Structural slice of the Playwright API we use (so the repo does not need its types).
interface PwPage {
	goto(url: string, o?: object): Promise<unknown>;
	url(): string;
	title(): Promise<string>;
	screenshot(o: { path: string; type: 'jpeg' | 'png'; quality?: number }): Promise<unknown>;
	locator(sel: string): { ariaSnapshot(o?: object): Promise<string>; innerText(o?: object): Promise<string>; click(o?: object): Promise<void>; fill(v: string, o?: object): Promise<void>; press(k: string, o?: object): Promise<void> };
	getByText(t: string, o?: object): { first(): { click(o?: object): Promise<void> } };
	on(ev: string, fn: (...a: never[]) => void): void;
	bringToFront(): Promise<void>;
	waitForLoadState(s: string, o?: object): Promise<void>;
}
interface PwContext {
	pages(): PwPage[];
	newPage(): Promise<PwPage>;
	close(): Promise<void>;
	on(ev: string, fn: (...a: never[]) => void): void;
}
export interface PwModule {
	chromium: { launchPersistentContext(dir: string, o: object): Promise<PwContext> };
}
export type PwLoader = () => Promise<PwModule>;

export class PlaywrightMissing extends Error {
	constructor(detail = '') {
		super(
			`Playwright is not installed. Use "Install browser" in the Browser view, or run: npm install playwright@${PLAYWRIGHT_VERSION} --prefix "${playwrightDir()}" && node "${playwrightDir()}/node_modules/playwright/cli.js" install chromium${detail ? ` (${detail})` : ''}`
		);
		this.name = 'PlaywrightMissing';
	}
}

/** Load Playwright: the app's own node_modules first, then the lazy-install dir. */
export const loadPlaywright: PwLoader = async () => {
	const tries: (() => Promise<unknown>)[] = [
		() => import(/* @vite-ignore */ 'playwright' as string),
		() => import(pathToFileURL(join(playwrightDir(), 'node_modules', 'playwright', 'index.mjs')).href),
		() => import(pathToFileURL(join(playwrightDir(), 'node_modules', 'playwright', 'index.js')).href)
	];
	let last = '';
	for (const t of tries) {
		try {
			const m = (await t()) as { chromium?: unknown; default?: { chromium?: unknown } };
			const mod = (m.chromium ? m : m.default) as PwModule | undefined;
			if (mod?.chromium) return mod;
		} catch (e) {
			last = (e as Error).message;
		}
	}
	throw new PlaywrightMissing(last.slice(0, 120));
};

export async function playwrightAvailable(loader: PwLoader = loadPlaywright): Promise<boolean> {
	try {
		await loader();
		return true;
	} catch {
		return false;
	}
}

/** Lazy install: the package into `playwrightDir()`, then Chromium. Streams progress lines to `onLine`. */
export function installPlaywright(onLine: (l: string) => void = () => {}): Promise<void> {
	const dir = playwrightDir();
	mkdirSync(dir, { recursive: true });
	const run = (cmd: string, args: string[]) =>
		new Promise<void>((resolve, reject) => {
			const p = spawn(cmd, args, { cwd: dir, env: process.env });
			const feed = (b: Buffer) => b.toString().split('\n').map((s) => s.trim()).filter(Boolean).forEach((l) => onLine(l.slice(0, 200)));
			p.stdout.on('data', feed);
			p.stderr.on('data', feed);
			p.on('error', reject);
			p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited with ${c}`))));
		});
	return (async () => {
		onLine(`Installing playwright@${PLAYWRIGHT_VERSION} into ${dir}`);
		await run('npm', ['install', '--no-audit', '--no-fund', '--prefix', dir, `playwright@${PLAYWRIGHT_VERSION}`]);
		onLine('Installing Chromium (about 150 MB)');
		await run('node', [join(dir, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium']);
		onLine('Done');
	})();
}

// --- controller ---------------------------------------------------------------

export interface BrowserLogRow {
	ts: number;
	action: string;
	detail: string;
	ok: boolean;
}

export interface BrowserState {
	status: 'closed' | 'launching' | 'open' | 'error';
	headed: boolean;
	url: string;
	title: string;
	/** Absolute path of the last screenshot (a file in the bot's media folder), or ''. */
	lastShot: string;
	error: string;
	log: BrowserLogRow[];
}

export interface BrowserOptions {
	profileDir: string;
	mediaDir: string;
	headed?: boolean;
	loader?: PwLoader;
	now?: () => number;
}

const MAX_LOG = 100;
const ALLOWED = new Set(['http:', 'https:', 'about:']);

/** Null when the URL may be opened; otherwise why not. Only web pages: never file:, javascript:, data:. */
export function urlProblem(raw: string): string | null {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return `"${raw}" is not a full URL (include https://).`;
	}
	return ALLOWED.has(u.protocol) ? null : `Only http(s) pages can be opened (got ${u.protocol}).`;
}

export class BrowserController {
	private pw: PwContext | null = null;
	private page: PwPage | null = null;
	private starting: Promise<PwPage> | null = null;
	private listeners = new Set<(s: BrowserState) => void>();
	private readonly now: () => number;
	state: BrowserState;
	readonly opts: BrowserOptions;

	constructor(opts: BrowserOptions) {
		this.opts = opts;
		this.now = opts.now ?? Date.now;
		this.state = { status: 'closed', headed: !!opts.headed, url: '', title: '', lastShot: '', error: '', log: [] };
	}

	subscribe(fn: (s: BrowserState) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private set(patch: Partial<BrowserState>) {
		this.state = { ...this.state, ...patch };
		for (const l of this.listeners) l(this.state);
	}

	private note(action: string, detail: string, ok: boolean) {
		const log = [...this.state.log, { ts: this.now(), action, detail: detail.slice(0, 300), ok }].slice(-MAX_LOG);
		this.set({ log });
	}

	setHeaded(on: boolean) {
		this.set({ headed: on });
	}

	/** Launch (once); concurrent callers share the launch. Reopens when the mode changed. */
	async ensure(): Promise<PwPage> {
		if (this.page && this.pw) return this.page;
		if (this.starting) return this.starting;
		this.starting = (async () => {
			this.set({ status: 'launching', error: '' });
			try {
				const mod = await (this.opts.loader ?? loadPlaywright)();
				mkdirSync(this.opts.profileDir, { recursive: true });
				mkdirSync(this.opts.mediaDir, { recursive: true });
				const ctx = await mod.chromium.launchPersistentContext(this.opts.profileDir, {
					headless: !this.state.headed,
					viewport: { width: 1280, height: 800 }
				});
				ctx.on('close', (() => {
					this.pw = null;
					this.page = null;
					this.set({ status: 'closed' });
				}) as never);
				const page = ctx.pages()[0] ?? (await ctx.newPage());
				this.pw = ctx;
				this.page = page;
				this.set({ status: 'open', url: page.url() === 'about:blank' ? '' : page.url() });
				this.note('launch', this.state.headed ? 'visible window' : 'headless', true);
				return page;
			} catch (err) {
				const msg = (err as Error).message;
				this.set({ status: 'error', error: msg });
				this.note('launch', msg, false);
				throw err;
			} finally {
				this.starting = null;
			}
		})();
		return this.starting;
	}

	private async sync(page: PwPage) {
		const url = page.url();
		this.set({ url: url === 'about:blank' ? '' : url, title: await page.title().catch(() => '') });
	}

	private async act<T>(action: string, detail: string, fn: (page: PwPage) => Promise<T>): Promise<T> {
		const page = await this.ensure();
		try {
			const out = await fn(page);
			await this.sync(page);
			this.note(action, detail, true);
			return out;
		} catch (err) {
			this.note(action, `${detail}: ${(err as Error).message}`, false);
			throw err;
		}
	}

	async navigate(url: string): Promise<{ url: string; title: string }> {
		const bad = urlProblem(url);
		if (bad) {
			this.note('navigate', `${url}: ${bad}`, false);
			throw new Error(bad);
		}
		return this.act('navigate', url, async (p) => {
			await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
			return { url: p.url(), title: await p.title().catch(() => '') };
		});
	}

	/** Accessibility-tree text of the page (or of one element), capped. */
	async snapshot(selector = 'body'): Promise<string> {
		return this.act('snapshot', selector, async (p) => capText(await p.locator(selector).ariaSnapshot({ timeout: 10_000 })).text);
	}

	async extractText(selector = 'body'): Promise<string> {
		return this.act('extract', selector, async (p) => capText(await p.locator(selector).innerText({ timeout: 10_000 })).text);
	}

	/** Save a JPEG into the media folder; returns its path. Never returns bytes. */
	async screenshot(): Promise<{ path: string; bytes: number }> {
		return this.act('screenshot', '', async (p) => {
			mkdirSync(this.opts.mediaDir, { recursive: true });
			const path = join(this.opts.mediaDir, `shot-${this.now()}.jpg`);
			await p.screenshot({ path, type: 'jpeg', quality: 60 });
			this.set({ lastShot: path });
			return { path, bytes: existsSync(path) ? statSync(path).size : 0 };
		});
	}

	async click(target: { selector?: string; text?: string }): Promise<void> {
		if (!target.selector && !target.text) throw new Error('click needs a selector or text.');
		return this.act('click', target.selector ?? `text:${target.text}`, async (p) => {
			if (target.selector) await p.locator(target.selector).click({ timeout: 10_000 });
			else await p.getByText(target.text!, { exact: false }).first().click({ timeout: 10_000 });
			await p.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
		});
	}

	async type(selector: string, text: string, submit = false): Promise<void> {
		return this.act('type', `${selector} (${text.length} chars${submit ? ', submit' : ''})`, async (p) => {
			await p.locator(selector).fill(text, { timeout: 10_000 });
			if (submit) await p.locator(selector).press('Enter', { timeout: 10_000 });
		});
	}

	async close(): Promise<void> {
		const ctx = this.pw;
		this.pw = null;
		this.page = null;
		if (ctx) await ctx.close().catch(() => {});
		this.set({ status: 'closed' });
	}

	/** Close and reopen with the new window mode (profile is kept). */
	async relaunch(headed: boolean): Promise<void> {
		await this.close();
		this.setHeaded(headed);
		await this.ensure();
	}
}

export const BROWSER_RESULT_CAP = MAX_RESULT_CHARS;
