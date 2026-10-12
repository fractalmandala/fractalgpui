import { persisted } from '../storage.svelte.ts';

/**
 * Slice 6 kernel: USD→INR conversion for the usage popover (PRODUCT §4.5).
 * The catalog reports USD; the rate is fetched live, cached with its fetch
 * time, and the popover states which rate produced the figure.
 *
 * Pure logic takes an injected `FxBag` (tests use memory). The app's bag over
 * the `persisted('fx')` slot is created lazily by `appFxBag()` — never at
 * import time, so `bun test` can import this module without the Svelte
 * transform (see PROJECT_LOG F15).
 */

export const FX_URL = 'https://open.er-api.com/v6/latest/USD';
export const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * First-run offline fallback. Rough by design; replaced on the first
 * successful fetch, and the UI always states the rate source.
 */
export const BUNDLED_FALLBACK_RATE = 88;

export interface FxState {
	rate: number;
	fetchedAt: number;
}

export interface FxBag {
	read(): FxState | undefined;
	write(next: FxState): void;
}

export type FxSource = 'live' | 'cached' | 'bundled';

export interface FxStatus extends FxState {
	source: FxSource;
	error?: string;
}

/** Minimal fetch surface (structurally satisfied by the global fetch). */
export type FxFetch = (url: string) => Promise<{
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
}>;

/** Parse USD→INR out of the endpoint's answer; throws the endpoint's own error verbatim. */
export async function fetchInrRate(fetchImpl: FxFetch = (url) => globalThis.fetch(url)): Promise<number> {
	let res: { ok: boolean; status: number; json(): Promise<unknown> };
	try {
		res = await fetchImpl(FX_URL);
	} catch (err) {
		throw new Error(`Could not reach the FX endpoint: ${(err as Error).message}`);
	}
	if (!res.ok) throw new Error(`The FX endpoint answered ${res.status}.`);
	let json: unknown;
	try {
		json = await res.json();
	} catch {
		throw new Error('The FX endpoint did not return JSON.');
	}
	const body = json as { result?: unknown; rates?: unknown; 'error-type'?: unknown };
	if (body.result === 'error') throw new Error(`The FX endpoint reported: ${String(body['error-type'] ?? 'unknown error')}`);
	const inr = (body.rates as { INR?: unknown } | undefined)?.INR;
	if (typeof inr !== 'number' || !(inr > 0)) throw new Error('The FX endpoint did not return an INR rate.');
	return inr;
}

export interface FxOptions {
	fetchImpl?: FxFetch;
	clock?: () => number;
}

/** Rate state over a bag: daily refresh, offline keeps the last standing rate. */
export function createFx(bag: FxBag, opts: FxOptions = {}) {
	const fetchImpl = opts.fetchImpl ?? ((url) => globalThis.fetch(url));
	const clock = opts.clock ?? Date.now;

	const status = (): FxStatus => {
		const cached = bag.read();
		return cached ? { ...cached, source: 'cached' } : { rate: BUNDLED_FALLBACK_RATE, fetchedAt: 0, source: 'bundled' };
	};

	const refresh = async (): Promise<FxStatus> => {
		const current = status();
		if (current.source === 'cached' && clock() - current.fetchedAt < FX_MAX_AGE_MS) return current;
		try {
			const rate = await fetchInrRate(fetchImpl);
			const next: FxState = { rate, fetchedAt: clock() };
			bag.write(next);
			return { ...next, source: 'live' };
		} catch (err) {
			return { ...current, error: (err as Error).message };
		}
	};

	return { status, refresh };
}

/** Convert USD at the given status; the caller states `rate.source` in the UI. */
export function convertUsd(usd: number, status: FxStatus): { inr: number; rate: number; source: FxSource } {
	return { inr: usd * status.rate, rate: status.rate, source: status.source };
}

/** `₹1,234.56` (en-IN grouping). */
export function formatInr(amount: number): string {
	return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

let appBag: FxBag | null = null;

/** The app's bag over the `persisted('fx')` slot. Call at use sites, not at import. */
export function appFxBag(): FxBag {
	if (!appBag) {
		const slot = persisted('fx', { rate: BUNDLED_FALLBACK_RATE, fetchedAt: 0 });
		appBag = {
			read: () => ({ rate: slot.rate, fetchedAt: slot.fetchedAt }),
			write: (next) => {
				slot.rate = next.rate;
				slot.fetchedAt = next.fetchedAt;
			}
		};
	}
	return appBag;
}
