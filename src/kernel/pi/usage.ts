import type { Message, Usage } from '@earendil-works/pi-ai';
import { estimateContextTokens } from '@earendil-works/pi-ai/utils/estimate';

/**
 * Slice 6 kernel: usage and context figures as pure functions over the
 * session's records, unit-tested without a window (see `usage.test.ts`).
 * Slice 7 renders these in the gauge + popover; nothing here touches UI.
 */

export interface ContextFigures {
	used: number;
	total: number;
	left: number;
	/** 0–100. */
	percent: number;
	/** Tokens the in-flight or most recent turn put into context. */
	thisTurn: number;
	/** False until an assistant usage block has been recorded. */
	hasRun: boolean;
}

/** Context-window figures from the committed messages and the model's window. */
export function contextFigures(messages: readonly Message[], contextWindow: number): ContextFigures {
	const est = estimateContextTokens(messages);
	const total = Math.max(0, contextWindow);
	const used = Math.max(0, est.tokens);
	return {
		used,
		total,
		left: Math.max(0, total - used),
		percent: total > 0 ? (used / total) * 100 : 0,
		thisTurn: Math.max(0, est.trailingTokens),
		hasRun: est.lastUsageIndex !== null
	};
}

/** The `pi.usage` document: model buckets keyed `provider/modelId`, tool buckets by tool name. */
export interface UsageBuckets {
	models: Record<string, Partial<Usage>>;
	tools: Record<string, Partial<Usage>>;
}

export interface ProviderFigures {
	input: number;
	output: number;
	/** Null when no bucket reported the counter — the popover shows `—`, never `0`. */
	cacheRead: number | null;
	cacheWrite: number | null;
	reasoning: number | null;
	/** 0–1, null when unknowable. */
	cacheHitRate: number | null;
	tokens: number;
	/** Summed catalog cost, USD. */
	costUsd: number;
	hasRun: boolean;
}

function sumReported(bucket: Partial<Usage>[], pick: (u: Partial<Usage>) => number | undefined): { total: number; seen: boolean } {
	let total = 0;
	let seen = false;
	for (const u of bucket) {
		const v = pick(u);
		if (typeof v === 'number') {
			seen = true;
			total += v;
		}
	}
	return { total, seen };
}

/** Provider token figures summed over every bucket of the usage document. */
export function providerFigures(state: UsageBuckets | undefined): ProviderFigures {
	const buckets = state ? [...Object.values(state.models), ...Object.values(state.tools)] : [];
	if (!buckets.length) {
		return { input: 0, output: 0, cacheRead: null, cacheWrite: null, reasoning: null, cacheHitRate: null, tokens: 0, costUsd: 0, hasRun: false };
	}
	const input = sumReported(buckets, (u) => u.input);
	const output = sumReported(buckets, (u) => u.output);
	const cacheRead = sumReported(buckets, (u) => u.cacheRead);
	const cacheWrite = sumReported(buckets, (u) => u.cacheWrite);
	const reasoning = sumReported(buckets, (u) => u.reasoning);
	const tokens = sumReported(buckets, (u) => u.totalTokens);
	let costUsd = 0;
	for (const u of buckets) costUsd += u.cost?.total ?? 0;
	const denom = cacheRead.total + input.total;
	return {
		input: input.total,
		output: output.total,
		cacheRead: cacheRead.seen ? cacheRead.total : null,
		cacheWrite: cacheWrite.seen ? cacheWrite.total : null,
		reasoning: reasoning.seen ? reasoning.total : null,
		cacheHitRate: cacheRead.seen && denom > 0 ? cacheRead.total / denom : null,
		tokens: tokens.total,
		costUsd,
		hasRun: true
	};
}

export interface ToolFigures {
	/** Union of recorded tool names and the live round's, sorted. */
	names: string[];
	/** Summed tool-bucket tokens. */
	tokens: number;
	byTool: { name: string; tokens: number }[];
	/** Tool slots running right now. */
	inFlight: number;
	hasRecordings: boolean;
}

/**
 * Tool figures from the usage document plus the live round. Committed per-call
 * counts are not in these documents — pair with `countToolCalls(entries)` over
 * the session's committed entries for the popover's call count.
 */
export function toolFigures(
	state: UsageBuckets | undefined,
	liveTools: readonly { name?: unknown }[] | undefined
): ToolFigures {
	const tools = state?.tools ?? {};
	const live = (liveTools ?? []).map((s) => (typeof s.name === 'string' && s.name ? s.name : 'tool'));
	const names = [...new Set([...Object.keys(tools), ...live])].sort();
	const byTool = Object.entries(tools)
		.map(([name, u]) => ({ name, tokens: u.totalTokens ?? 0 }))
		.sort((a, b) => b.tokens - a.tokens || (a.name < b.name ? -1 : 1));
	return {
		names,
		tokens: byTool.reduce((n, t) => n + t.tokens, 0),
		byTool,
		inFlight: live.length,
		hasRecordings: names.length > 0
	};
}

/** Committed tool calls: one `pi.tool-result` entry each. */
export function countToolCalls(entries: readonly { kind: string }[]): number {
	let n = 0;
	for (const e of entries) if (e.kind === 'pi.tool-result') n++;
	return n;
}

export interface SpeedTracker {
	/** Mark a submit. */
	start(): void;
	/** Mark a settle; ignores calls with no matching start. */
	stop(outputTokens: number): void;
	/** Output tokens per second for the last measured run, null until one completes. */
	readonly rate: number | null;
}

/**
 * The app's own generation-speed measurement (submit → settle wall time ÷
 * committed output tokens); the runtime exposes no provider-side figure.
 */
export function createSpeedTracker(clock: () => number = Date.now): SpeedTracker {
	let t0: number | null = null;
	let rate: number | null = null;
	return {
		start() {
			t0 = clock();
		},
		stop(outputTokens: number) {
			if (t0 === null) return;
			const dt = clock() - t0;
			t0 = null;
			rate = dt > 0 && outputTokens >= 0 ? outputTokens / (dt / 1000) : null;
		},
		get rate() {
			return rate;
		}
	};
}
