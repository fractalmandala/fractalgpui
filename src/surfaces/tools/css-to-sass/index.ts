import type { Tool } from '../types.ts';
import CssToSass from './CssToSass.svelte';
import Sidebar from './Sidebar.svelte';
import Toolbar from './Toolbar.svelte';
import { clear, copy_output, css_tool, load_sample, round_trip, set_direction, swap, type Tab } from './state.svelte.ts';

/** The Diff tab's badge: changed lines in the round trip, or nothing when exact. */
function diff_badge() {
	const rt = round_trip();
	return rt.ok && rt.patch ? rt.added + rt.removed : null;
}

export default {
	id: 'css-to-sass',
	title: 'CSS ⇄ Sass',
	icon: 'braces',
	description: 'Convert CSS to indented Sass, nesting where it is safe, or compile Sass and SCSS to CSS.',
	component: CssToSass,
	toolbar: Toolbar,
	sidebar: Sidebar,
	tabs: {
		// Diff is the CSS → Sass round trip; Sass → CSS has nothing to compare (see round_trip).
		list: () =>
			css_tool.direction === 'css-to-sass'
				? [
						{ id: 'convert', label: 'Convert' },
						{ id: 'diff', label: 'Diff', badge: diff_badge() }
					]
				: [{ id: 'convert', label: 'Convert' }],
		value: () => (css_tool.direction === 'css-to-sass' ? css_tool.tab : 'convert'),
		select: (id) => (css_tool.tab = id as Tab)
	},
	commands: [
		{ id: 'css-to-sass.copy', title: 'Copy output', keys: 'cmd-shift-c', run: copy_output },
		{ id: 'css-to-sass.swap', title: 'Swap direction (output becomes input)', run: swap },
		{ id: 'css-to-sass.to-sass', title: 'Direction: CSS → Sass', run: () => set_direction('css-to-sass') },
		{ id: 'css-to-sass.to-css', title: 'Direction: Sass → CSS', run: () => set_direction('sass-to-css') },
		{ id: 'css-to-sass.nest', title: 'Toggle selector nesting', run: () => (css_tool.nest = !css_tool.nest) },
		{ id: 'css-to-sass.sample', title: 'Load sample input', run: () => load_sample() },
		{ id: 'css-to-sass.convert', title: 'Show conversion', run: () => (css_tool.tab = 'convert') },
		{ id: 'css-to-sass.diff', title: 'Show round-trip diff (CSS → Sass)', run: () => (set_direction('css-to-sass'), (css_tool.tab = 'diff')) },
		{ id: 'css-to-sass.clear', title: 'Clear input', run: clear }
	]
} satisfies Tool;
