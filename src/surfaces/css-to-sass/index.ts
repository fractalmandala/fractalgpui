import type { Surface } from '../../kernel/types.ts';
import CssToSass from './CssToSass.svelte';
import Left from './Left.svelte';
import Toolbar from './Toolbar.svelte';
import { clear, copy_output, css_tool, load_sample, round_trip, type Tab } from './state.svelte.ts';

/** The Diff tab's badge: changed lines in the round trip, or nothing when exact. */
function diff_badge() {
	const rt = round_trip();
	return rt.ok && rt.patch ? rt.added + rt.removed : null;
}

export default {
	id: 'css-to-sass',
	title: 'CSS → Sass',
	icon: 'braces',
	description: 'Convert CSS to indented Sass, nesting where it is safe.',
	component: CssToSass,
	toolbar: Toolbar,
	left: Left,
	tabs: {
		list: () => [
			{ id: 'convert', label: 'Convert' },
			{ id: 'diff', label: 'Diff', badge: diff_badge() }
		],
		value: () => css_tool.tab,
		select: (id) => (css_tool.tab = id as Tab)
	},
	commands: [
		{ id: 'css-to-sass.copy', title: 'Copy Sass output', keys: 'cmd-shift-c', run: copy_output },
		{ id: 'css-to-sass.nest', title: 'Toggle selector nesting', run: () => (css_tool.nest = !css_tool.nest) },
		{ id: 'css-to-sass.sample', title: 'Load sample CSS', run: () => load_sample() },
		{ id: 'css-to-sass.convert', title: 'Show conversion', run: () => (css_tool.tab = 'convert') },
		{ id: 'css-to-sass.diff', title: 'Show round-trip diff', run: () => (css_tool.tab = 'diff') },
		{ id: 'css-to-sass.clear', title: 'Clear input', run: clear }
	]
} satisfies Surface;
