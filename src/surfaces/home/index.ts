import type { Surface } from '../../kernel/types.ts';
import PanelPrimary from '../agents/PanelPrimary.svelte';
import Home from './Home.svelte';

export default {
	id: 'home',
	title: 'Home',
	icon: 'house',
	description: 'Every surface in the workbench.',
	component: Home,
	sections: { 'sidebar-panel': { body: PanelPrimary } }
} satisfies Surface;
