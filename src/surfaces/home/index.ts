import type { Surface } from '../../kernel/types.ts';
import Home from './Home.svelte';

export default {
	id: 'home',
	title: 'Home',
	icon: 'house',
	description: 'Every surface in the workbench.',
	component: Home
} satisfies Surface;
