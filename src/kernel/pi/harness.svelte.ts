import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, Harness, MemoryStorage, type Harness as HarnessType } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { join } from 'node:path';
import { data_dir } from '../paths.ts';
import { buildModels, injectStoredKeys, isTestEnv, modelDefaults } from './models.ts';
import { freshSession, SessionsDoc } from './metadata.ts';
import { DEFAULT_EXTENSIONS, installAgentTools, installBotTools } from './tools.ts';
import { botRuntime } from './bots/extension.ts';
import type { Models } from '@earendil-works/pi-ai/models';


/** The one durable harness for the app. Opens lazily on first chat use. */
let harness: HarnessType | null = null;
let models: Models | null = null;

/** Shared model registry (catalog + refresh). Built once, alongside the harness. */
export function piModels(): Models {
	if (!models) models = buildModels();
	return models;
}
let opening: Promise<HarnessType> | null = null;

export const pi_context = () => BACKGROUND_CONTEXT;

export async function openHarness(): Promise<HarnessType> {
	if (harness) return harness;
	if (!opening) {
		opening = (async () => {
			injectStoredKeys();
			const storage = isTestEnv() ? new MemoryStorage() : await openNodeSqliteStorage(join(data_dir(), 'pi', 'agent.sqlite'));
			const registry = createRegistry();
			installAgentTools(registry);
			installBotTools(registry);
			botRuntime.models = piModels;
			const h = await Harness.open(
				storage,
				{
					models: piModels(),
					registry,
					// Plain sessions keep the shipped tools only; bot sessions add the bot extension at creation.
					settings: { extensions: DEFAULT_EXTENSIONS },
					// Per-conversation filesystem + shell, rooted at the session's
					// workspace folder (Slice 3). A session with no project gets an
					// env it cannot usefully act in; the policy layer (§6.10)
					// refuses those calls before they reach it.
					env: (target) => new NodeExecutionEnv({ cwd: target.cwd ?? data_dir(), shellEnv: process.env }),
					// Seeds the session index for every creation path. Never throws:
					// a throw would fail the creating commit, and the scan backfills.
					conversationCreated: async (tx, conversation) => {
						try {
							const d = await tx.doc(SessionsDoc);
							const id = String(conversation.id);
							if (!d.sessions[id]) d.sessions[id] = freshSession(null, Date.now(), modelDefaults.provider, modelDefaults.modelId);
						} catch (err) {
							console.warn(`[fractalgpui] session index seed failed: ${(err as Error).message}`);
						}
					}
				},
				pi_context()
			);
			h.resume();
			botRuntime.harness = h;
			harness = h;
			return h;
		})();
	}
	return opening;
}
