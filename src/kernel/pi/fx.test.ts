import { describe, expect, test } from 'bun:test';
import {
	BUNDLED_FALLBACK_RATE,
	convertUsd,
	createFx,
	fetchInrRate,
	formatInr,
	FX_MAX_AGE_MS,
	type FxBag,
	type FxFetch,
	type FxState
} from './fx.ts';

const memoryBag = (initial?: FxState): FxBag => {
	let current = initial ? { ...initial } : undefined;
	return {
		read: () => (current ? { ...current } : undefined),
		write: (next) => {
			current = { ...next };
		}
	};
};

const okFetch =
	(inr: unknown): FxFetch =>
	async () => ({
		ok: true,
		status: 200,
		json: async () => ({ result: 'success', rates: { INR: inr } })
	});

describe('fetchInrRate', () => {
	test('parses the INR rate out of a success answer', async () => {
		await expect(fetchInrRate(okFetch(91.5))).resolves.toBe(91.5);
	});

	test('reports endpoint errors verbatim and rejects garbage', async () => {
		const errorType: FxFetch = async () => ({ ok: true, status: 200, json: async () => ({ result: 'error', 'error-type': 'invalid-key' }) });
		await expect(fetchInrRate(errorType)).rejects.toThrow('invalid-key');
		const http: FxFetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
		await expect(fetchInrRate(http)).rejects.toThrow('429');
		await expect(fetchInrRate(okFetch('lots'))).rejects.toThrow('did not return an INR rate');
		await expect(fetchInrRate(okFetch(-3))).rejects.toThrow('did not return an INR rate');
		const down: FxFetch = async () => {
			throw new Error('socket hang up');
		};
		await expect(fetchInrRate(down)).rejects.toThrow('Could not reach');
	});
});

describe('createFx', () => {
	test('bundled fallback until the first successful fetch', async () => {
		const fx = createFx(memoryBag(), { fetchImpl: okFetch(90), clock: () => 1000 });
		expect(fx.status()).toEqual({ rate: BUNDLED_FALLBACK_RATE, fetchedAt: 0, source: 'bundled' });
		const live = await fx.refresh();
		expect(live).toEqual({ rate: 90, fetchedAt: 1000, source: 'live' });
		expect(fx.status().source).toBe('cached');
	});

	test('a fresh cache skips the fetch; a stale one refetches', async () => {
		let calls = 0;
		const counting: FxFetch = async (...args) => {
			calls++;
			return okFetch(91)(...args);
		};
		let now = 10_000;
		const fx = createFx(memoryBag({ rate: 89, fetchedAt: 9_000 }), { fetchImpl: counting, clock: () => now });
		await fx.refresh();
		expect(calls).toBe(0);
		now = 9_000 + FX_MAX_AGE_MS + 1;
		const next = await fx.refresh();
		expect(calls).toBe(1);
		expect(next).toEqual({ rate: 91, fetchedAt: now, source: 'live' });
	});

	test('a failed refresh keeps the last standing rate and reports the error', async () => {
		const down: FxFetch = async () => {
			throw new Error('offline');
		};
		const bag = memoryBag({ rate: 89, fetchedAt: 0 });
		const fx = createFx(bag, { fetchImpl: down, clock: () => FX_MAX_AGE_MS + 1 });
		const status = await fx.refresh();
		expect(status.source).toBe('cached');
		expect(status.rate).toBe(89);
		expect(status.error).toMatch('offline');
		expect(bag.read()).toEqual({ rate: 89, fetchedAt: 0 });
	});
});

describe('conversion and formatting', () => {
	test('convertUsd carries the rate and its source', () => {
		expect(convertUsd(0.5, { rate: 90, fetchedAt: 1, source: 'live' })).toEqual({ inr: 45, rate: 90, source: 'live' });
	});

	test('formatInr uses en-IN grouping with the rupee sign', () => {
		const text = formatInr(1234.5);
		expect(text).toContain('₹');
		expect(text).toContain('1,234.50');
	});
});
