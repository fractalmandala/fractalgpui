import { describe, expect, test } from 'bun:test';
import type { AssistantMessage, Message, Usage, UserMessage } from '@earendil-works/pi-ai';
import {
	contextFigures,
	countToolCalls,
	createSpeedTracker,
	providerFigures,
	toolFigures,
	type UsageBuckets
} from './usage.ts';

const user = (text: string): UserMessage => ({ role: 'user', content: text, timestamp: 1 });

const usage = (over: Partial<Usage> = {}): Usage => ({
	input: 100,
	output: 50,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 150,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.001 },
	...over
});

const assistant = (text: string, over: Partial<Usage> = {}): AssistantMessage => ({
	role: 'assistant',
	content: [{ type: 'text', text }],
	api: 'anthropic-messages',
	provider: 'anthropic',
	model: 'claude-sonnet-4-6',
	stopReason: 'stop',
	usage: usage(over),
	timestamp: 2
});

describe('contextFigures', () => {
	test('a fresh session shows the window total and 0 used', () => {
		expect(contextFigures([], 200000)).toEqual({
			used: 0,
			total: 200000,
			left: 200000,
			percent: 0,
			thisTurn: 0,
			hasRun: false
		});
	});

	test('figures follow the estimate once a run is recorded', () => {
		const messages: Message[] = [user('Capital of France?'), assistant('Paris.')];
		const fig = contextFigures(messages, 200000);
		expect(fig.hasRun).toBe(true);
		expect(fig.used).toBeGreaterThan(0);
		expect(fig.left).toBe(200000 - fig.used);
		expect(fig.percent).toBeCloseTo((fig.used / 200000) * 100, 6);
		expect(fig.thisTurn).toBeGreaterThanOrEqual(0);
	});

	test('a lone user message estimates but does not count as a run', () => {
		const fig = contextFigures([user('hello there')], 200000);
		expect(fig.hasRun).toBe(false);
		expect(fig.used).toBeGreaterThan(0);
	});
});

describe('providerFigures', () => {
	test('no document means no run and null counters', () => {
		expect(providerFigures(undefined)).toEqual({
			input: 0,
			output: 0,
			cacheRead: null,
			cacheWrite: null,
			reasoning: null,
			cacheHitRate: null,
			tokens: 0,
			costUsd: 0,
			hasRun: false
		});
	});

	test('sums every bucket and derives the cache-hit rate', () => {
		const state: UsageBuckets = {
			models: {
				'anthropic/claude-sonnet-4-6': usage({
					input: 1000,
					output: 200,
					cacheRead: 3000,
					cacheWrite: 100,
					totalTokens: 4300,
					cost: { input: 0.003, output: 0.003, cacheRead: 0.0003, cacheWrite: 0.0004, total: 0.0067 }
				})
			},
			tools: {
				read: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 50, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
			}
		};
		const fig = providerFigures(state);
		expect(fig.hasRun).toBe(true);
		expect(fig.input).toBe(1000);
		expect(fig.output).toBe(200);
		expect(fig.cacheRead).toBe(3000);
		expect(fig.cacheWrite).toBe(100);
		expect(fig.tokens).toBe(4350);
		expect(fig.costUsd).toBeCloseTo(0.0067, 6);
		expect(fig.cacheHitRate).toBeCloseTo(3000 / 4000, 6);
	});

	test('unreported counters stay null — never zero-filled', () => {
		const state: UsageBuckets = {
			models: { 'openai/gpt-4o': { input: 10, output: 5, totalTokens: 15 } },
			tools: {}
		};
		const fig = providerFigures(state);
		expect(fig.cacheRead).toBeNull();
		expect(fig.cacheWrite).toBeNull();
		expect(fig.reasoning).toBeNull();
		expect(fig.cacheHitRate).toBeNull();
	});

	test('reasoning passes through only when a provider reports it', () => {
		const withReasoning: UsageBuckets = {
			models: { 'openai/gpt-4o': { input: 10, output: 20, totalTokens: 30, reasoning: 12 } },
			tools: {}
		};
		expect(providerFigures(withReasoning).reasoning).toBe(12);
	});
});

describe('toolFigures', () => {
	test('empty state and idle round', () => {
		expect(toolFigures(undefined, undefined)).toEqual({ names: [], tokens: 0, byTool: [], inFlight: 0, hasRecordings: false });
	});

	test('names union recorded and live tools; tokens sum the buckets', () => {
		const state: UsageBuckets = {
			models: {},
			tools: {
				read: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 60, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				bash: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
			}
		};
		const fig = toolFigures(state, [{ name: 'bash' }, { name: 'edit' }]);
		expect(fig.names).toEqual(['bash', 'edit', 'read']);
		expect(fig.tokens).toBe(100);
		expect(fig.byTool).toEqual([
			{ name: 'read', tokens: 60 },
			{ name: 'bash', tokens: 40 }
		]);
		expect(fig.inFlight).toBe(2);
		expect(fig.hasRecordings).toBe(true);
	});
});

describe('countToolCalls', () => {
	test('counts one committed tool-result entry each', () => {
		expect(countToolCalls([])).toBe(0);
		expect(
			countToolCalls([{ kind: 'pi.user' }, { kind: 'pi.assistant' }, { kind: 'pi.tool-result' }, { kind: 'pi.tool-result' }])
		).toBe(2);
	});
});

describe('createSpeedTracker', () => {
	test('measures output tokens per second between start and stop', () => {
		let now = 1000;
		const tracker = createSpeedTracker(() => now);
		expect(tracker.rate).toBeNull();
		tracker.start();
		now += 2000;
		tracker.stop(100);
		expect(tracker.rate).toBe(50);
	});

	test('a stop with no start is ignored; a zero-duration run yields null', () => {
		let now = 500;
		const tracker = createSpeedTracker(() => now);
		tracker.stop(10);
		expect(tracker.rate).toBeNull();
		tracker.start();
		tracker.stop(10);
		expect(tracker.rate).toBeNull();
	});
});
