/**
 * Models & providers view state. Every action sets `models_ui.message` (a visible success or error line at
 * the top of the view) so the result is never silent; long-running ones show their own busy state.
 */
import { piModels } from '../../kernel/pi/harness.svelte.ts';
import {
	clearKey,
	credentialBag,
	customProviders,
	envDetectedProviders,
	isEnvIgnored,
	keepModel,
	keysFolder,
	keptModels,
	modelDefaults,
	saveKey,
	saveKeyEnvRef,
	setEnvIgnored,
	unkeepModel,
	updateCustomProvider
} from '../../kernel/pi/models.ts';
import { fetchEndpointModels, keyEnvFor, keyProblem } from '../../kernel/pi/providers.ts';
import { fetchWindows, type WindowsResult } from '../../kernel/pi/windows.ts';
import { flash } from '../../kernel/status.svelte.ts';
import { view } from '../agents/session.svelte.ts';

export const models_ui = $state({
	/** Provider whose detail (key + model search) is open. */
	open: '',
	search: '',
	keyDraft: '',
	envDraft: '',
	message: null as { kind: 'success' | 'danger'; text: string } | null,
	picking: false,
	adding: false,
	refreshing: false,
	windows: null as (WindowsResult & { provider: string }) | null,
	windowsBusy: false,
	/** Bumped after changes the catalog does not signal (endpoints added or refreshed). */
	rev: 0
});

function say(kind: 'success' | 'danger', text: string) {
	models_ui.rev++;
	models_ui.message = { kind, text };
	flash(text, kind, kind === 'danger' ? 8000 : 4000);
}

export function openProvider(id: string) {
	models_ui.open = models_ui.open === id ? '' : id;
	models_ui.search = '';
	models_ui.keyDraft = '';
	models_ui.envDraft = keyEnvFor(id) ?? '';
}

export function toggleKeep(provider: string, modelId: string, on: boolean) {
	if (on) keepModel(provider, modelId);
	else unkeepModel(provider, modelId);
	say('success', on ? `Kept ${modelId}. It now appears in the model picker.` : `Removed ${modelId} from your kept models.`);
}

export function toggleEnvIgnore(providerId: string, ignored: boolean) {
	setEnvIgnored(providerId, ignored);
	say('success', ignored ? `Ignoring the environment key for ${providerId}. Its models are not offered.` : `No longer ignoring the environment key for ${providerId}.`);
}

export function saveProviderKey(id: string) {
	const problem = keyProblem(id, models_ui.keyDraft);
	if (problem) return say('danger', problem);
	try {
		saveKey(id, models_ui.keyDraft);
		models_ui.keyDraft = '';
		say('success', `Key saved to ${keysFolder()}/${id}.key (owner-only). Now keep some of its models.`);
	} catch (err) {
		say('danger', `Could not save the key: ${(err as Error).message}`);
	}
}

export function useEnvVar(id: string) {
	try {
		saveKeyEnvRef(id, models_ui.envDraft);
		say('success', `${id} will read its key from $${models_ui.envDraft.trim()}. Nothing was copied to disk.`);
	} catch (err) {
		say('danger', (err as Error).message);
	}
}

export function removeKey(id: string) {
	clearKey(id);
	say('success', `Removed the stored key for ${id}.`);
}

/** Re-fetch a custom endpoint's model list with its stored key. */
export async function refreshEndpoint(id: string) {
	const def = customProviders().find((d) => d.id === id);
	if (!def) return say('danger', `${id} is not a custom endpoint.`);
	const key = credentialBag.readAll()[id];
	if (key?.type !== "api_key" || !key.key) return say('danger', 'Save a key for this endpoint first.');
	models_ui.refreshing = true;
	try {
		const ids = await fetchEndpointModels(def.baseUrl, key.key);
		updateCustomProvider(piModels(), id, { ...def, modelIds: ids });
		say('success', `Fetched ${ids.length} models from ${def.name}.`);
	} catch (err) {
		say('danger', (err as Error).message);
	} finally {
		models_ui.refreshing = false;
	}
}

export function pickDefault(provider: string, modelId: string) {
	modelDefaults.provider = provider;
	modelDefaults.modelId = modelId;
	models_ui.picking = false;
	say('success', `New sessions start on ${provider}/${modelId}.`);
}

/** The session shown in the chat pane (usage panel subject), if any. */
export const currentChat = () => view.surface;

export async function checkLimits() {
	const chat = currentChat();
	const provider = chat?.provider ?? '';
	if (!provider) return say('danger', 'Open a session with a model first.');
	models_ui.windowsBusy = true;
	try {
		const key = credentialBag.readAll()[provider];
		models_ui.windows = { provider, ...(await fetchWindows(provider, key?.type === 'api_key' ? key.key : undefined)) };
	} finally {
		models_ui.windowsBusy = false;
	}
}

export const kept = () => keptModels(piModels());
export const detected = () => envDetectedProviders(piModels());
export { isEnvIgnored };
