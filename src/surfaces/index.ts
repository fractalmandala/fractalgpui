/**
 * Every workbench tool, in rail order. Adding a tool = a folder under `src/surfaces/`
 * with an `index.ts` manifest, plus one line here.
 */

import type { PlannedSurface, Surface } from '../kernel/types.ts';
import home from './home/index.ts';
import css_to_sass from './css-to-sass/index.ts';

export const SURFACES: Surface[] = [home, css_to_sass];

/** Next up, in rough order; Home lists them as muted cards. */
export const PLANNED: PlannedSurface[] = [
	{ title: 'Sass → CSS', icon: 'arrow-right-left', description: 'Compile indented Sass or SCSS with dart-sass.' },
	{ title: 'Class finder', icon: 'search', description: 'Search fractalstyler classes and what GPUI keeps of each.' },
	{ title: 'Token inspector', icon: 'layers', description: 'Every token, light and dark, flattened to px.' },
	{ title: 'Colour tools', icon: 'palette', description: 'Contrast, conversions and palettes from the theme.' }
];
