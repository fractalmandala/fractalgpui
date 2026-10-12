import type { AuthEvent, AuthInteraction, AuthPrompt } from '@earendil-works/pi-ai';

/**
 * Subscription sign-in plumbing (Slice 7, PRODUCT §7.6): turns a provider's
 * `Models.login(providerId, 'oauth', interaction)` call into UI callbacks the
 * Add-provider modal renders — prompt forms, status lines, the device-code
 * step, and external URL opens. Pure and injectable so `login.test.ts` drives
 * it with stubs; no network in tests.
 */
export interface LoginUi {
	prompt(prompt: AuthPrompt): Promise<string>;
	note(text: string): void;
	openUrl(url: string): void;
	device(step: { userCode: string; verificationUri: string }): void;
}

export function describeEvent(event: AuthEvent): string {
	switch (event.type) {
		case 'info':
			return event.message;
		case 'auth_url':
			return event.instructions ?? 'Open this URL to sign in.';
		case 'device_code':
			return `Enter ${event.userCode} at ${event.verificationUri}.`;
		case 'progress':
			return event.message;
	}
}

export async function runLoginFlow(
	login: (interaction: AuthInteraction) => Promise<unknown>,
	ui: LoginUi,
	signal?: AbortSignal
): Promise<{ ok: true } | { ok: false; error: string }> {
	const interaction: AuthInteraction = {
		...(signal ? { signal } : {}),
		prompt: (p) => ui.prompt(p),
		notify: (e) => {
			if (e.type === 'auth_url') {
				ui.note(describeEvent(e));
				ui.openUrl(e.url);
			} else if (e.type === 'device_code') {
				ui.device({ userCode: e.userCode, verificationUri: e.verificationUri });
			} else {
				ui.note(describeEvent(e));
			}
		}
	};
	try {
		await login(interaction);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}
