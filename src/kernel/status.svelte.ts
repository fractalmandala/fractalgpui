/** The title strip's transient message (e.g. "Copied 12 lines"). */

export type Tone = 'info' | 'success' | 'danger';

export const status = $state<{ message: string; tone: Tone }>({ message: '', tone: 'info' });

let timer: ReturnType<typeof setTimeout> | null = null;

export function flash(message: string, tone: Tone = 'info', ms = 2500) {
	status.message = message;
	status.tone = tone;
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		status.message = '';
		timer = null;
	}, ms);
}
