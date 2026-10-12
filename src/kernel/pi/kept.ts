// The model policy, in plain TypeScript (bound to the persisted slot in models.ts):
//  - only models you explicitly KEEP can be picked; nothing is preferred silently,
//  - a provider whose key is detected in the environment is listed as "detected from env" and contributes
//    nothing until you keep one of its models; you can ignore it,
//  - an ignored env provider's models are not pickable.
import { envKeyFor, keyEnvFor } from './providers.ts';

export interface KeptState {
	/** `provider/modelId` strings, in the order they were kept. */
	kept: string[];
	/** Provider ids whose env-detected key is ignored. */
	ignoredEnv: Record<string, boolean>;
}

export const refOf = (provider: string, modelId: string) => `${provider}/${modelId}`;

export function splitRef(ref: string): { provider: string; modelId: string } | null {
	const i = ref.indexOf('/');
	return i > 0 && i < ref.length - 1 ? { provider: ref.slice(0, i), modelId: ref.slice(i + 1) } : null;
}

export const isKept = (s: KeptState, provider: string, modelId: string) => s.kept.includes(refOf(provider, modelId));

/** Returns the next kept list (never mutates). Keeping twice is a no-op. */
export const keepRef = (s: KeptState, provider: string, modelId: string): string[] => (isKept(s, provider, modelId) ? s.kept : [...s.kept, refOf(provider, modelId)]);
export const unkeepRef = (s: KeptState, provider: string, modelId: string): string[] => s.kept.filter((r) => r !== refOf(provider, modelId));

export interface EnvDetected {
	providerId: string;
	name: string;
	env: string;
	ignored: boolean;
	/** How many of this provider's models are kept. */
	keptCount: number;
}

/** Providers whose documented API-key variable is set (and was not put there by this app). */
export function detectEnv(s: KeptState, providers: { id: string; name: string }[]): EnvDetected[] {
	const out: EnvDetected[] = [];
	for (const p of providers) {
		const env = envKeyFor(p.id);
		if (!env) continue;
		out.push({ providerId: p.id, name: p.name, env, ignored: s.ignoredEnv[p.id] === true, keptCount: s.kept.filter((r) => splitRef(r)?.provider === p.id).length });
	}
	return out;
}

/** True when the provider's only credential source is the environment and the user chose to ignore it. */
export function envIgnored(s: KeptState, providerId: string, storedKey: boolean): boolean {
	return s.ignoredEnv[providerId] === true && !!keyEnvFor(providerId) && !!envKeyFor(providerId) && !storedKey;
}
