import type { ToolManifest } from '../../kernel/types.ts';
import Home from './Home.svelte';

export default {
	id: 'home',
	title: 'Home',
	icon: 'house',
	description: 'What is here, what is next, and how the styling adapter is doing.',
	component: Home,
	agent: false
} satisfies ToolManifest;
