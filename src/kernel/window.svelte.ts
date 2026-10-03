/**
 * The window's size as state. gpuix 0.7 reports no resize event, so the shell polls
 * `getWindowSize()` (cheap, native) while it is mounted; headless it is fixed.
 */

import { get_native } from 'gpuix-svelte/renderer';

export const win = $state({ width: 1100, height: 720 });

function read() {
	const size = get_native()?.getWindowSize();
	if (!size) return;
	if (size.width !== win.width) win.width = size.width;
	if (size.height !== win.height) win.height = size.height;
}

/** Starts polling; returns the stop function (use as an `$effect` teardown). */
export function watch_window(every_ms = 250): () => void {
	read();
	const timer = setInterval(read, every_ms);
	return () => clearInterval(timer);
}
