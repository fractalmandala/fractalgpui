import type { ToolManifest } from '../../kernel/types.ts';
import CssToSass from './CssToSass.svelte';
import { clear, copy_output, css_tool, load_sample } from './state.svelte.ts';

export default {
	id: 'css-to-sass',
	title: 'CSS → Sass',
	glyph: 'Ss',
	description: 'Convert CSS to indented Sass, nesting where it is safe.',
	component: CssToSass,
	commands: [
		{ id: 'css-to-sass.copy', title: 'Copy Sass output', keys: 'cmd-shift-c', run: copy_output },
		{ id: 'css-to-sass.nest', title: 'Toggle selector nesting', run: () => (css_tool.nest = !css_tool.nest) },
		{ id: 'css-to-sass.sample', title: 'Load sample CSS', run: load_sample },
		{ id: 'css-to-sass.clear', title: 'Clear input', run: clear }
	]
} satisfies ToolManifest;
