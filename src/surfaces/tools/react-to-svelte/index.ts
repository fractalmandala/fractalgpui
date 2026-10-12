import type { Tool } from '../types.ts';
import ReactToSvelte from './ReactToSvelte.svelte';
import Sidebar from './Sidebar.svelte';
import Toolbar from './Toolbar.svelte';
import { clear, convert, copy_output, current_file, load_sample, select_file } from './state.svelte.ts';

/** One tab per output file (a React file with several components becomes several .svelte files). */
function files() {
	const o = convert();
	return o.ok ? o.result.files : [];
}

export default {
	id: 'react-to-svelte',
	title: 'React → Svelte',
	icon: 'svelte-react',
	description: 'Convert a React component (TSX/JSX, hooks) to Svelte 5 with runes, snippets and typed props.',
	component: ReactToSvelte,
	toolbar: Toolbar,
	sidebar: Sidebar,
	tabs: {
		list: () => files().map((f) => ({ id: f.name, label: f.name, badge: f.warnings.length || null })),
		value: () => current_file()?.name ?? '',
		select: select_file
	},
	commands: [
		{ id: 'react-to-svelte.copy', title: 'Copy the Svelte file', run: copy_output },
		{ id: 'react-to-svelte.sample', title: 'Load sample React component', run: () => load_sample() },
		{
			id: 'react-to-svelte.next-file',
			title: 'Show the next output file',
			run: () => {
				const list = files();
				const i = list.findIndex((f) => f.name === current_file()?.name);
				if (list.length) select_file(list[(i + 1) % list.length].name);
			}
		},
		{ id: 'react-to-svelte.clear', title: 'Clear input', run: clear }
	]
} satisfies Tool;
