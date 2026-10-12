import type { EntryRecord } from '@earendil-works/pi-durable';


export type ChatRow =
	| { kind: 'user'; text: string }
	| { kind: 'thinking'; text: string }
	| { kind: 'assistant'; text: string }
	| { kind: 'code'; code: string; language: string }
	| { kind: 'tool'; label: string; detail: string; failed: boolean }
	| { kind: 'approval'; callId: string; tool: string; summary: string; detail: string; status: 'pending' | 'approved' | 'denied' }
	| { kind: 'notice'; text: string };

type Block = { type: string; text?: string; thinking?: string; name?: string; id?: string; arguments?: unknown };

function blocks_of(message: { content?: unknown }): Block[] {
	const content = (message as { content?: unknown }).content;
	if (typeof content === 'string') return [{ type: 'text', text: content }];
	if (Array.isArray(content)) return content as Block[];
	return [];
}

const text_of = (blocks: Block[]): string =>
	blocks
		.filter((b) => b.type === 'text' && typeof b.text === 'string')
		.map((b) => b.text as string)
		.join('');

/**
 * Committed entries plus the in-flight partial → render rows.
 * View entries arrive oldest-first; the partial appends while a run is live
 * and vanishes once its answer commits (no duplication by construction).
 * Live tool slots render while pending/running; finished slots are skipped
 * because their result entries already carry the record.
 */
export function projectEntries(
	entries: readonly EntryRecord[],
	live: Record<string, unknown> | undefined,
	docs?: Record<string, unknown>
): ChatRow[] {
	const rows: ChatRow[] = [];
	// Calls whose committed result errored — their rows render as failures (§6.6).
	const failedCalls = new Set<string>();
	for (const entry of entries) {
		if (entry.kind !== 'pi.tool-result') continue;
		const message = entry.model?.[0] as { toolCallId?: unknown; isError?: unknown } | undefined;
		if (message?.isError === true && typeof message.toolCallId === 'string') failedCalls.add(message.toolCallId);
	}
	for (const entry of entries) {
		const message = entry.model?.[0] as { role?: string; content?: unknown } | undefined;
		switch (entry.kind) {
			case 'pi.user': {
				const text = message ? text_of(blocks_of(message)) : '';
				if (text.trim()) rows.push({ kind: 'user', text });
				break;
			}
			case 'pi.assistant': {
				if (!message) break;
				const blocks = blocks_of(message);
				const thinking = blocks
					.filter((b) => b.type === 'thinking' && typeof b.thinking === 'string')
					.map((b) => b.thinking as string)
					.join('\n');
				if (thinking.trim()) rows.push({ kind: 'thinking', text: thinking });
			for (const call of blocks.filter((b) => b.type === 'toolCall')) {
				rows.push({ kind: 'tool', label: String(call.name ?? 'tool'), detail: JSON.stringify(call.arguments ?? {}), failed: typeof call.id === 'string' && failedCalls.has(call.id) });
			}
			const text = text_of(blocks);
			if (text.trim()) rows.push({ kind: 'assistant', text });
			break;
		}
		case 'pi.tool-result': {
			const text = message ? text_of(blocks_of(message)) : '';
			if (text.trim()) rows.push({ kind: 'code', code: text, language: 'text' });
			break;
			}
			case 'fractal.approval': {
				const data = (entry.data ?? {}) as {
					callId?: unknown;
					tool?: unknown;
					summary?: unknown;
					args?: unknown;
				};
				if (typeof data.callId !== 'string') break;
				const calls = (docs?.['fractal.approvals'] ?? {}) as {
					calls?: Record<string, { status?: unknown }>;
				};
				const status = calls.calls?.[data.callId]?.status;
				rows.push({
					kind: 'approval',
					callId: data.callId,
					tool: typeof data.tool === 'string' ? data.tool : 'tool',
					summary: typeof data.summary === 'string' ? data.summary : '',
					detail: typeof data.args === 'string' ? data.args : '',
					status: status === 'approved' || status === 'denied' ? status : 'pending'
				});
				break;
			}
			case 'pi.reset':
				rows.push({ kind: 'notice', text: 'Context reset — earlier entries are out of scope' });
				break;
			case 'pi.compaction':
				rows.push({ kind: 'notice', text: 'Context compacted — older entries summarized' });
				break;
			default:
				break;
		}
	}
	// Live tool round: pending/running slots render with their running output.
	// Finished slots are skipped — their result entries already carry the record.
	const slots = ((live?.['tools'] as { name?: unknown; status?: unknown; output?: unknown }[] | undefined) ?? []).filter(
		(s) => s.status === 'pending' || s.status === 'running'
	);
	for (const slot of slots) {
		const output = typeof slot.output === 'string' ? slot.output : '';
		const tail = output.length > 200 ? `…${output.slice(-200)}` : output;
		rows.push({
			kind: 'tool',
			label: typeof slot.name === 'string' ? slot.name : 'tool',
			detail: tail.trim() ? `${slot.status}: ${tail.trim()}` : String(slot.status ?? 'pending'),
			failed: false
		});
	}
	const partial = ((live?.['generation'] as { message?: { content?: unknown } } | undefined)?.message?.content ?? []) as Block[];
	const partialText = text_of(Array.isArray(partial) ? (partial as Block[]) : []);
	if (partialText.trim()) rows.push({ kind: 'assistant', text: partialText });
	return rows;
}

/** `true` exactly while a run works on an input. */
export function isBusy(live: Record<string, unknown> | undefined): boolean {
	return (live?.['run'] as { taskId?: string } | undefined)?.taskId !== undefined;
}

/** Spend line for the sidebar; quiet when nothing is recorded yet. */
export function formatUsage(docs: Record<string, unknown> | undefined): string {
	const usage = docs?.['pi.usage'] as { models?: Record<string, { totalTokens?: number; cost?: { total?: number } }>; tools?: object } | undefined;
	if (!usage) return '$0.00 · 0 tokens';
	let tokens = 0;
	let cost = 0;
	for (const m of Object.values(usage.models ?? {})) {
		tokens += m.totalTokens ?? 0;
		cost += m.cost?.total ?? 0;
	}
	if (!tokens && !cost) return '$0.00 · 0 tokens';
	return `$${cost.toFixed(4)} · ${tokens} tokens`;
}

/** Whole-transcript text for the `transcript.copy` command. */
export function transcriptText(rows: ChatRow[]): string {
	return rows
		.map((row) => {
			switch (row.kind) {
				case 'user':
					return `You: ${row.text}`;
				case 'thinking':
					return `Thinking: ${row.text}`;
				case 'assistant':
					return row.text;
				case 'code':
					return row.code;
				case 'tool':
					return `${row.label} ${row.detail}${row.failed ? ' (failed)' : ''}`;
				case 'approval':
					return `Approval (${row.status}): ${row.summary} ${row.detail}`;
				case 'notice':
					return row.text;
			}
		})
		.join('\n\n');
}
