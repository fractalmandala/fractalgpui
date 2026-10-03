import { render_hot } from './build/hot.ts';

// Opens the native GPUI window. Styles come from build/styles.ts (fractalstyler src,
// translated for GPUI, plus src/styles/_own.sass); saves to .svelte/.sass files in
// src/ or in fractalstyler's styles remount the app.
await render_hot(new URL('./src/App.svelte', import.meta.url), {
	title: 'fractalgpui',
	width: 1440,
	height: 860,
	minWidth: 720,
	minHeight: 480
});
