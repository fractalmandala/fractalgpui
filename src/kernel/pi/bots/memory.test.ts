import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_MEMORY, type MemoryConfig } from './meta.ts';
import { dayOf, MAX_PENDING, MemoryManager, oneLine, type Summarize } from './memory.ts';

const cleanups: Array<() => void> = [];
afterAll(() => {
	for (const c of cleanups.splice(0).reverse()) c();
});

const cfg = (o: Partial<MemoryConfig> = {}): MemoryConfig => ({ ...DEFAULT_MEMORY(), viewBudgetChars: 2000, keepRecent: 6, fan: 4, ...o });
/** TEST DOUBLE: deterministic "model": first words of the input, tagged with what kind of call it was. */
const fakeSum: Summarize = async (r) => (r.kind === 'merge' ? `merged(${r.text.split('\n').length}): ${r.text.replace(/\[\d+\] /g, '').slice(0, 110)}` : `${r.role}: ${r.text.slice(0, 90)}`);
const BASE = 1_760_000_000_000;

function mem(o: { summarize?: Summarize; config?: MemoryConfig; maxNodes?: number } = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-mem-'));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	const make = (summarize = o.summarize) => new MemoryManager({ file: join(dir, 'm', 'memory.sqlite'), config: () => o.config ?? cfg(), summarize, maxNodes: o.maxNodes, retryAfterMs: 0 });
	const m = make();
	cleanups.push(() => m.close());
	return { m, dir, make };
}
const feed = (m: MemoryManager, n: number, start = 0) => {
	for (let i = 0; i < n; i++) m.record({ src: `e${start + i}`, role: i % 2 ? 'assistant' : 'user', text: `message number ${start + i} about topic ${(start + i) % 7} with some detail`, ts: BASE + (start + i) * 60_000 });
};
const dirBytes = (dir: string) => readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0);

describe('temporal memory view', () => {
	test('stays within its budget while 400 messages arrive; old history gets coarser; every message is accounted for', async () => {
		const { m } = mem({ summarize: fakeSum });
		for (let i = 0; i < 400; i += 20) {
			feed(m, 20, i);
			await m.drain();
			expect(m.view().text.length).toBeLessThanOrEqual(m.view().budget);
		}
		await m.idle();
		const v = m.view();
		const st = m.status();
		expect(st).toMatchObject({ ok: true, pending: 0 });
		expect(st.maxLevel).toBeGreaterThanOrEqual(2);
		expect(v.lines.some((l) => l.kind === 'merge')).toBe(true);
		expect(v.lines.at(-1)!.kind).toBe('msg');
		expect(v.lines.slice(-6).every((l) => l.level === 0)).toBe(true); // keepRecent never merged
		expect(st.roots).toBeLessThan(60);
		expect(v.text).toContain('memory_zoom');
		expect(v.omitted).toBe(0);
	});

	test('zoom expands a merge into the lines it summarized; date lists a day; both are bounded', async () => {
		const { m } = mem({ summarize: fakeSum });
		feed(m, 120);
		await m.drain();
		const merge = m.view().lines.find((l) => l.kind === 'merge')!;
		const z = m.zoom(merge.id);
		expect(z.lines.length).toBeGreaterThanOrEqual(2);
		expect(z.lines.length).toBeLessThanOrEqual(4);
		expect(z.note).toContain('merged into');
		const d = m.date(dayOf(BASE));
		expect(d.lines.length).toBeGreaterThan(0);
		expect(d.lines.length).toBeLessThanOrEqual(80);
		expect(m.date('1999-01-01').note).toContain('Nothing is remembered');
		expect(m.date('tomorrow').note).toContain('YYYY-MM-DD');
		expect(m.zoom(999_999).note).toContain('No memory line');
	});

	test('is idempotent per message and survives a restart', async () => {
		const { m, make } = mem({ summarize: fakeSum });
		feed(m, 30);
		feed(m, 30);
		await m.drain();
		expect(m.status().nodes).toBeLessThan(60);
		const before = m.view().text;
		m.close();
		const again = make();
		cleanups.push(() => again.close());
		expect(again.view().text).toBe(before);
	});

	test('without a summarizer nothing is faked: lines stay pending and flagged, with the reason', async () => {
		const { m } = mem({ summarize: undefined });
		feed(m, 5);
		await m.drain();
		const st = m.status();
		expect(st.ok).toBe(false);
		expect(st.pending).toBe(5);
		expect(st.message).toContain('No summarizer');
		expect(m.view().lines.every((l) => l.pending && l.text.startsWith('(not summarized yet)'))).toBe(true);
	});

	test('a failing summarizer reports its error, keeps lines pending, and retry() recovers', async () => {
		let fail = true;
		const { m } = mem({
			summarize: async (r) => {
				if (fail) throw new Error('HTTP 401 bad key');
				return fakeSum(r);
			}
		});
		feed(m, 3);
		await m.drain();
		expect(m.status()).toMatchObject({ ok: false, pending: 3 });
		expect(m.status().message).toContain('HTTP 401');
		fail = false;
		await m.retry();
		expect(m.status()).toMatchObject({ ok: true, pending: 0 });
	});

	test('when it cannot merge, the view is still clipped to the budget and says so', async () => {
		const { m } = mem({ summarize: undefined, config: cfg({ viewBudgetChars: 2000 }) });
		feed(m, 100);
		await m.drain();
		const v = m.view();
		expect(v.text.length).toBeLessThanOrEqual(2000);
		expect(v.omitted).toBeGreaterThan(0);
		expect(v.text).toContain('older line(s) not shown');
	});
});

describe('memory stays bounded on disk', () => {
	test('prunes the oldest children beyond maxNodes and caps pending rows', async () => {
		const { m } = mem({ summarize: fakeSum, maxNodes: 120 });
		for (let i = 0; i < 600; i += 30) {
			feed(m, 30, i);
			await m.drain();
		}
		expect(m.status().nodes).toBeLessThanOrEqual(120);
		const q = mem({ summarize: undefined });
		feed(q.m, MAX_PENDING + 50);
		expect(q.m.status().pending).toBeLessThanOrEqual(MAX_PENDING);
	});

	test('4000 messages with a node cap keep the database under 1 MB and the view at budget', async () => {
		const { m, dir } = mem({ summarize: fakeSum, maxNodes: 1500 });
		for (let i = 0; i < 4000; i += 200) {
			feed(m, 200, i);
			await m.drain();
		}
		expect(m.status().nodes).toBeLessThanOrEqual(1500);
		expect(m.view().text.length).toBeLessThanOrEqual(2000);
		m.close();
		expect(dirBytes(join(dir, 'm'))).toBeLessThan(1_000_000);
	});

	test('one line is at most 512 bytes and single-line', () => {
		const l = oneLine('héllo\n\nwörld '.repeat(200));
		expect(Buffer.byteLength(l)).toBeLessThanOrEqual(512);
		expect(l).not.toContain('\n');
	});
});
