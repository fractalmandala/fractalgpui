import { describe, expect, test } from 'bun:test';
import type { AuthEvent, AuthInteraction, AuthPrompt } from '@earendil-works/pi-ai';
import { describeEvent, runLoginFlow, type LoginUi } from './login.ts';

const ui = (): LoginUi & { prompts: AuthPrompt[]; notes: string[]; urls: string[]; devices: { userCode: string; verificationUri: string }[] } => {
	const seen = { prompts: [] as AuthPrompt[], notes: [] as string[], urls: [] as string[], devices: [] as { userCode: string; verificationUri: string }[] };
	return {
		...seen,
		prompt: async (p) => {
			seen.prompts.push(p);
			return 'answer';
		},
		note: (t) => seen.notes.push(t),
		openUrl: (u) => seen.urls.push(u),
		device: (d) => seen.devices.push(d)
	};
};

describe('runLoginFlow', () => {
	test('prompts and every event kind reach the UI, then success', async () => {
		const seen = ui();
		const events: AuthEvent[] = [
			{ type: 'info', message: 'hello' },
			{ type: 'auth_url', url: 'https://sign.in/x', instructions: 'Click it.' },
			{ type: 'device_code', userCode: 'ABCD-1234', verificationUri: 'https://verify.example' },
			{ type: 'progress', message: 'waiting…' }
		];
		const login = async (interaction: AuthInteraction) => {
			for (const e of events) interaction.notify(e);
			const answer = await interaction.prompt({ type: 'text', message: 'Name?' });
			if (answer !== 'answer') throw new Error('prompt answer lost');
			const picked = await interaction.prompt({ type: 'select', message: 'Pick', options: [{ id: 'a', label: 'A' }] });
			if (picked !== 'answer') throw new Error('select answer lost');
			return { type: 'oauth' };
		};
		await expect(runLoginFlow(login, seen)).resolves.toEqual({ ok: true });
		expect(seen.prompts.map((p) => p.type)).toEqual(['text', 'select']);
		expect(seen.notes).toEqual(['hello', 'Click it.', 'waiting…']);
		expect(seen.urls).toEqual(['https://sign.in/x']);
		expect(seen.devices).toEqual([{ userCode: 'ABCD-1234', verificationUri: 'https://verify.example' }]);
	});

	test('a failing login reports the error and keeps it off the UI notes', async () => {
		const seen = ui();
		const result = await runLoginFlow(
			async () => {
				throw new Error('denied by provider');
			},
			seen
		);
		expect(result).toEqual({ ok: false, error: 'denied by provider' });
	});

	test('describeEvent covers every event kind', () => {
		expect(describeEvent({ type: 'info', message: 'm' })).toBe('m');
		expect(describeEvent({ type: 'auth_url', url: 'u' })).toBe('Open this URL to sign in.');
		expect(describeEvent({ type: 'device_code', userCode: 'C', verificationUri: 'V' })).toBe('Enter C at V.');
		expect(describeEvent({ type: 'progress', message: 'p' })).toBe('p');
	});
});
