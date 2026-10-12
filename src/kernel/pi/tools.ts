import { Type } from '@earendil-works/pi-ai';
import type { Context } from '@earendil-works/chord';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
	defineDoc,
	defineEntry,
	defineExtension,
	defineTool,
	LiveDoc,
	section,
	wrapTool,
	type ConversationDocToken,
	type ConversationId,
	type Entry,
	type Harness,
	type Registry,
	type ToolExecutionApi,
	type ToolExecutionResult,
	type ToolRegistration
} from '@earendil-works/pi-durable';
import {
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	CodingTools
} from '@earendil-works/pi-durable/tools';
import { SessionsDoc } from './metadata.ts';
import { BotsDoc } from './bots/meta.ts';
import { capabilityFor } from './bots/personality.ts';
import { auditFor, botTools } from './bots/extension.ts';
import { classifyDestructive } from './destructive.ts';
import { capToolResult, preview } from './caps.ts';
import type { AuditRow } from './audit.ts';
import type { AccessMode, AgentType } from './metadata.ts';

/**
 * Slice 4 — the agent's tools and the approval policy.
 *
 * - `CodingTools` (bash/read/write/edit, shipped by pi-durable) do the work.
 * - `fractalTools` wraps the four in the access policy, adds the `todo` tool
 *   and a workspace section for the system prompt.
 * - Approvals are durable: a `fractal.approval` entry records the request, a
 *   `fractal.approvals` document carries its mutable status, and the wrapper
 *   waits on that document — so an approval survives an app restart.
 */

// --- records ---------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export type ApprovalState = {
	status: ApprovalStatus;
	tool: string;
	summary: string;
	args: string;
	createdAt: number;
	reason?: string;
};

export type ApprovalsState = {
	calls: Record<string, ApprovalState>;
};

export const ApprovalsDoc: ConversationDocToken<ApprovalsState> = defineDoc({
	kind: 'fractal.approvals',
	version: 1,
	scope: 'conversation',
	history: 'latest',
	fork: 'current',
	initial: () => ({ calls: {} })
});

export type ApprovalEntryData = {
	callId: string;
	tool: string;
	summary: string;
	args: string;
	status: 'pending';
};

export const ApprovalEntry: Entry<ApprovalEntryData> = defineEntry<ApprovalEntryData>('fractal.approval');

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type TodoItem = {
	text: string;
	status: TodoStatus;
};

export type TodosState = {
	items: TodoItem[];
	updatedAt: number;
};

export const TodosDoc: ConversationDocToken<TodosState> = defineDoc({
	kind: 'fractal.todos',
	version: 1,
	scope: 'conversation',
	history: 'latest',
	fork: 'current',
	initial: () => ({ items: [], updatedAt: 0 })
});

// --- policy ----------------------------------------------------------------

export type ToolClass = 'read' | 'write' | 'exec';

export type PolicyVerdict = { kind: 'allow' } | { kind: 'ask' } | { kind: 'refuse'; reason: string };

const NO_WORKSPACE =
	'No workspace folder is set for this session, so file and shell tools refuse. Ask the user to choose a folder.';

/**
 * Pure access decision (PRODUCT §6.1, §6.10). Reads never ask but are still
 * confined; the `todo` tool is run bookkeeping, never workspace work, and
 * always runs. Plan/Ask sessions refuse changes outright — the model is told
 * to describe the work instead.
 */
export function classify(
	access: AccessMode,
	agentType: AgentType,
	toolClass: ToolClass | 'meta',
	hasWorkspace: boolean
): PolicyVerdict {
	if (toolClass === 'meta') return { kind: 'allow' };
	if (!hasWorkspace) return { kind: 'refuse', reason: NO_WORKSPACE };
	if ((agentType === 'plan' || agentType === 'ask') && toolClass !== 'read') {
		return {
			kind: 'refuse',
			reason: `This session runs in ${agentType} mode, which makes no changes. Describe what you would do instead of calling tools that change files or run commands.`
		};
	}
	switch (access) {
		case 'supervised':
			return toolClass === 'read' ? { kind: 'allow' } : { kind: 'ask' };
		case 'edits':
			return toolClass === 'exec' ? { kind: 'ask' } : { kind: 'allow' };
		case 'full':
			return { kind: 'allow' };
	}
}

const textResult = (text: string, isError: boolean) => ({
	isError,
	content: [{ type: 'text' as const, text }]
});

const refuse = (reason: string) => textResult(`Not run: ${reason}`, true);

function summarize(toolName: string, args: unknown): string {
	const a = (args ?? {}) as Record<string, unknown>;
	if (toolName === 'bash' && typeof a.command === 'string') return a.command;
	if (typeof a.path === 'string') return a.path;
	try {
		return JSON.stringify(args ?? {});
	} catch {
		return toolName;
	}
}

/** Absolute path outside the workspace, or null when the call stays inside. */
async function outsideWorkspace(
	api: ToolExecutionApi,
	args: unknown,
	workspace: string,
	context: Context
): Promise<string | null> {
	const env = api.env;
	if (!env) return 'There is no execution environment for this session.';
	const raw = (args ?? {}) as Record<string, unknown>;
	if (typeof raw.path !== 'string' || !raw.path.trim()) return null;
	const canonical = await canonicalUnder(env, raw.path, context);
	if (!canonical) return `Could not resolve the path: ${raw.path}.`;
	const dir = await env.canonicalPath(workspace, context);
	if (!dir.ok) return `Could not resolve the path: ${raw.path}.`;
	const base = dir.value.endsWith('/') ? dir.value : `${dir.value}/`;
	if (canonical !== dir.value && !canonical.startsWith(base)) {
		return `Refused: ${raw.path} resolves outside the workspace folder.`;
	}
	return null;
}
// Resolves the nearest existing ancestor when the target itself does not exist
// yet (writes to new files). Null when nothing resolves — refused, not guessed.
async function canonicalUnder(env: NonNullable<ToolExecutionApi['env']>, rawPath: string, context: Context): Promise<string | null> {
	const direct = await env.canonicalPath(rawPath, context);
	if (direct.ok) return direct.value;
	const absolute = rawPath.startsWith('/');
	const parts = rawPath.split('/');
	for (let drop = 1; drop <= parts.length; drop++) {
		const head = parts.slice(0, parts.length - drop).join('/');
		const ancestor = head === '' ? (absolute ? '/' : '.') : head;
		const resolved = await env.canonicalPath(ancestor, context);
		if (resolved.ok) return `${resolved.value}/${parts.slice(parts.length - drop).join('/')}`;
	}
	return null;
}

async function waitForDecision(
	api: ToolExecutionApi,
	callId: string,
	context: Context
): Promise<'approved' | 'denied' | 'stopped'> {
	const decided = (v: Readonly<ApprovalsState> | null): 'approved' | 'denied' | null => {
		const s = v?.calls[callId]?.status;
		return s === 'approved' || s === 'denied' ? s : null;
	};
	const watch = await api.watchDoc(ApprovalsDoc, api.conversationId, context).catch(() => undefined);
	if (!watch) return 'denied';
	return new Promise((resolve) => {
		let done = false;
		const finish = (v: 'approved' | 'denied' | 'stopped') => {
			if (done) return;
			done = true;
			clearInterval(timer);
			void watch.stop();
			resolve(v);
		};
		// A stopped run must not hang the tool: poll the live doc, and treat a
		// vanished run as a denial (§6.5). unref'd so a settled test never hangs.
		const timer = setInterval(() => {
			void (async () => {
				if (done) return;
				try {
					const live = await api.snapshot(LiveDoc, api.conversationId, context);
					if (!live?.run) finish('stopped');
				} catch {
					// A failed read decides nothing; keep waiting for the user.
				}
			})();
		}, 250);
		(timer as unknown as { unref?: () => void }).unref?.();
		const cur = decided(watch.value);
		if (cur) {
			finish(cur);
			return;
		}
		void watch.start(async (value) => {
			const s = decided(value);
			if (s) finish(s);
		});
	});
}

/**
 * Wrap one built-in tool in the access policy + workspace confinement.
 *
 * Sessions WITHOUT a bot behave exactly as before. A session that belongs to a bot additionally gets:
 * capability toggles (shell / file writes), the bot's botroom as default workspace, no folder
 * confinement (bots roam; the access mode still applies), destructive-action detection that forces
 * an approval, an fsynced audit row BEFORE the call and one after, and capped tool results.
 */
function guardTool<Tool extends ToolRegistration>(tool: Tool, toolClass: ToolClass): Tool {
	return {
		...tool,
		execute: async (args, api, context) => {
			const snap = await api.snapshot(SessionsDoc, context).catch(() => undefined);
			const meta = snap?.sessions[String(api.conversationId)];
			const access: AccessMode = meta?.access ?? 'supervised';
			const agentType: AgentType = meta?.agentType ?? 'build';
			const projectId = meta?.projectId ?? null;
			const botId = meta?.botId;
			const botSnap = botId ? await api.snapshot(BotsDoc, context).catch(() => undefined) : undefined;
			const bot = botId ? botSnap?.bots[botId] : undefined;
			const workspace = (projectId ? snap?.projects[projectId]?.path : undefined) ?? bot?.workspace;
			// Bots roam the drive; plain sessions stay confined to their project folder.
			const confineTo = bot ? undefined : workspace;
			const callId = api.callId;
			const summary = summarize(tool.name, args);
			const log = (row: Omit<AuditRow, 'ts' | 'tool' | 'callId'>) => {
				if (botId && bot) auditFor(botId).append({ ...row, tool: tool.name, callId });
			};

			if (bot) {
				const cap = capabilityFor(tool.name);
				if (cap && !bot.capabilities[cap]) {
					const why = `${bot.identity.name} has ${tool.name === 'bash' ? 'the shell' : 'file writes'} switched off.`;
					log({ phase: 'blocked', summary: why });
					return refuse(why);
				}
			}
			const verdict = classify(access, agentType, toolClass, !!workspace);
			if (verdict.kind === 'refuse') {
				log({ phase: 'blocked', summary: verdict.reason });
				return refuse(verdict.reason);
			}
			if (confineTo) {
				const outside = await outsideWorkspace(api, args, confineTo, context);
				if (outside) return refuse(outside);
			}
			const destructive = bot && workspace ? classifyDestructive(tool.name, (args ?? {}) as Record<string, unknown>, workspace) : undefined;
			const mustAsk = verdict.kind === 'ask' || !!destructive;

			// The audit row goes down BEFORE the action; if it cannot be written the call does not run.
			try {
				log({ phase: 'before', summary: preview(args, 600), destructive: !!destructive });
			} catch (err) {
				return refuse(`the audit log could not be written (${(err as Error).message}), so nothing was run.`);
			}
			const run = async () => {
				const result = await tool.execute(args, api, context);
				if (!bot) return result;
				const { result: capped, report } = capToolResult(result as ToolExecutionResult);
				log({
					phase: 'after',
					summary: report.truncated ? 'result truncated' : 'ok',
					ok: !result.isError,
					...(report.imagesDropped ? { note: `${report.imagesDropped} image block(s) dropped` } : {})
				});
				return capped as typeof result;
			};
			if (!mustAsk) return run();

			// Ask: record the request durably and wait for the decision.
			const shown = destructive ? `[${destructive.reason}] ${summary}` : summary;
			const argsJson = (() => {
				try {
					return JSON.stringify(args ?? {});
				} catch {
					return '{}';
				}
			})();
			await api.commit(async (tx) => {
				await tx.appendEntry(ApprovalEntry, api.conversationId, {
					data: { callId, tool: tool.name, summary: shown, args: argsJson, status: 'pending' }
				});
				const d = await tx.doc(ApprovalsDoc, api.conversationId);
				d.calls[callId] = { status: 'pending', tool: tool.name, summary: shown, args: argsJson, createdAt: Date.now() };
			}, context);
			const verdict2 = await waitForDecision(api, callId, context);
			log({ phase: 'approval', summary: destructive?.reason ?? 'access policy', destructive: !!destructive, approved: verdict2 === 'approved' });
			if (verdict2 === 'approved') {
				const result = await run();
				await api
					.commit(async (tx) => {
						const d = await tx.doc(ApprovalsDoc, api.conversationId);
						if (d.calls[callId]) d.calls[callId].status = 'approved';
					}, context)
					.catch(() => {});
				return result;
			}
			const why =
				verdict2 === 'stopped'
					? 'The run was stopped while waiting for approval, so the call was not run.'
					: 'The user denied this call.';
			log({ phase: 'blocked', summary: why });
			await api
				.commit(async (tx) => {
					const d = await tx.doc(ApprovalsDoc, api.conversationId);
					if (d.calls[callId]) {
						d.calls[callId].status = 'denied';
						d.calls[callId].reason = why;
					}
				}, context)
				.catch(() => {});
			return textResult(`Not run: ${why} Continue without it or ask for another way.`, true);
		}
	};
}

// --- the run's step list ----------------------------------------------------

const todoSchema = Type.Object({
	todos: Type.Array(
		Type.Object({
			content: Type.String(),
			status: Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed')])
		})
	)
});

const TODO_STATUSES: TodoStatus[] = ['pending', 'in_progress', 'completed'];

const todoTool = defineTool({
	name: 'todo',
	description:
		'Declare the steps of the current run so progress can be shown. Replaces the whole list on every call; steps not started are pending.',
	parameters: todoSchema,
	execute: async (args, api, context) => {
		const items: TodoItem[] = args.todos
			.filter((t) => t.content.trim())
			.map((t) => ({
				text: t.content.trim(),
				status: (TODO_STATUSES.includes(t.status as TodoStatus) ? t.status : 'pending') as TodoStatus
			}));
		await api.commit(async (tx) => {
			const d = await tx.doc(TodosDoc, api.conversationId);
			d.items = items;
			d.updatedAt = Date.now();
		}, context);
		const done = items.filter((i) => i.status === 'completed').length;
		return textResult(
			items.length ? `Tracking ${done}/${items.length} completed.` : 'Step list cleared.',
			false
		);
	}
});

// --- extension --------------------------------------------------------------

export const fractalTools = defineExtension({
	name: 'fractal-tools',
	sections: [
		section('fractal-workspace', (input) => {
			const cwd = input.agent.cwd;
			return cwd
				? `Workspace folder: ${cwd}. File and shell tools act inside it. A mutating call may pause for the user's approval — when it is approved, keep working; when it is denied, work another way.`
				: 'No workspace folder is set: file and shell tools will refuse. Ask the user to choose a folder before doing file or shell work.';
		})
	],
	tools: [todoTool],
	wraps: [
		wrapTool(createBashTool(), (t) => guardTool(t, 'exec')),
		wrapTool(createReadTool(), (t) => guardTool(t, 'read')),
		wrapTool(createWriteTool(), (t) => guardTool(t, 'write')),
		wrapTool(createEditTool(), (t) => guardTool(t, 'write'))
	]
});

/** Install the shipped tools plus the app policy onto a registry. */
export function installAgentTools(registry: Registry): void {
	registry.install(CodingTools);
	registry.install(fractalTools);
}

/** The extensions every plain session runs with (the host default once bot tools are installed). */
export const DEFAULT_EXTENSIONS = [CodingTools, fractalTools];

/** Install the bot extension (identity/profile/memory sections, character/profile/memory tools). Bot sessions select it. */
export function installBotTools(registry: Registry): void {
	registry.install(botTools);
}
/**
 * Record the user's answer on a pending approval (Slice 7: the transcript's
 * Approve/Deny buttons). Unknown call ids are ignored — the run keeps
 * waiting, and the row stays pending.
 */
export async function decideApproval(
	h: Harness,
	id: ConversationId,
	callId: string,
	verdict: 'approved' | 'denied'
): Promise<void> {
	await h.commit(async (tx) => {
		const d = await tx.doc(ApprovalsDoc, id);
		if (d.calls[callId]) d.calls[callId].status = verdict;
	}, BACKGROUND_CONTEXT);
}
