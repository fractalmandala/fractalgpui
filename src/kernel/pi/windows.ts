// Usage windows (rate/quota limits). Shown only where a provider really reports them; otherwise the answer is
// "unavailable" with the reason. Nothing is estimated.
export interface UsageWindow {
	label: string;
	used?: number;
	limit?: number;
	remaining?: number;
	/** epoch ms */
	resetsAt?: number;
	unit: 'tokens' | 'requests' | 'usd';
}
export type WindowsResult = { available: true; windows: UsageWindow[]; source: string } | { available: false; reason: string };

const num = (v: unknown): number | undefined => {
	const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(n) ? n : undefined;
};

/** Parse `anthropic-ratelimit-*` / `x-ratelimit-*` response headers into windows (pure). */
export function windowsFromHeaders(h: { get(name: string): string | null }): UsageWindow[] {
	const out: UsageWindow[] = [];
	const reset = (v: string | null): number | undefined => {
		if (!v) return undefined;
		const t = Date.parse(v);
		return Number.isFinite(t) ? t : undefined;
	};
	for (const [prefix, unit, label] of [
		['anthropic-ratelimit-requests', 'requests', 'Requests'],
		['anthropic-ratelimit-tokens', 'tokens', 'Tokens'],
		['anthropic-ratelimit-input-tokens', 'tokens', 'Input tokens'],
		['anthropic-ratelimit-output-tokens', 'tokens', 'Output tokens']
	] as const) {
		const limit = num(h.get(`${prefix}-limit`));
		const remaining = num(h.get(`${prefix}-remaining`));
		if (limit === undefined && remaining === undefined) continue;
		out.push({ label, unit, ...(limit !== undefined ? { limit } : {}), ...(remaining !== undefined ? { remaining } : {}), ...(reset(h.get(`${prefix}-reset`)) !== undefined ? { resetsAt: reset(h.get(`${prefix}-reset`)) } : {}) });
	}
	for (const [suffix, unit, label] of [
		['requests', 'requests', 'Requests'],
		['tokens', 'tokens', 'Tokens']
	] as const) {
		const limit = num(h.get(`x-ratelimit-limit-${suffix}`));
		const remaining = num(h.get(`x-ratelimit-remaining-${suffix}`));
		if (limit === undefined && remaining === undefined) continue;
		out.push({ label, unit, ...(limit !== undefined ? { limit } : {}), ...(remaining !== undefined ? { remaining } : {}) });
	}
	return out;
}

/** OpenRouter's `/api/v1/key`: credit limit and spend for this key. */
export async function openRouterWindows(apiKey: string, fetchFn: typeof fetch = fetch): Promise<WindowsResult> {
	let res: Response;
	try {
		res = await fetchFn('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
	} catch (err) {
		return { available: false, reason: `Could not reach OpenRouter: ${(err as Error).message}` };
	}
	if (!res.ok) return { available: false, reason: `OpenRouter answered ${res.status} for the key endpoint.` };
	let body: { data?: Record<string, unknown> };
	try {
		body = (await res.json()) as typeof body;
	} catch {
		return { available: false, reason: 'OpenRouter did not return JSON for the key endpoint.' };
	}
	const d = body.data ?? {};
	const windows: UsageWindow[] = [];
	const limit = num(d.limit);
	const usage = num(d.usage);
	const remaining = num(d.limit_remaining);
	if (usage !== undefined || limit !== undefined) {
		windows.push({ label: 'Credit', unit: 'usd', ...(usage !== undefined ? { used: usage } : {}), ...(limit !== undefined ? { limit } : {}), ...(remaining !== undefined ? { remaining } : {}) });
	}
	for (const [k, label] of [['usage_daily', 'Today'], ['usage_weekly', 'This week'], ['usage_monthly', 'This month']] as const) {
		const v = num(d[k]);
		if (v !== undefined) windows.push({ label, unit: 'usd', used: v });
	}
	return windows.length ? { available: true, windows, source: 'OpenRouter /api/v1/key' } : { available: false, reason: 'OpenRouter returned no usage figures for this key.' };
}

/** Window limits for a provider; unavailable (with the reason) wherever the app has no way to read them. */
export async function fetchWindows(providerId: string, apiKey: string | undefined, fetchFn: typeof fetch = fetch): Promise<WindowsResult> {
	if (providerId === 'openrouter') {
		if (!apiKey) return { available: false, reason: 'Set an OpenRouter key to read its credit limit.' };
		return openRouterWindows(apiKey, fetchFn);
	}
	return { available: false, reason: `${providerId} does not expose window limits that this app can read. Token counts for the session are still shown.` };
}
