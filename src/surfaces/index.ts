/**
 * Every workbench tool, in rail order. Adding a tool = a folder under `src/surfaces/`
 * with an `index.ts` manifest, plus one line here.
 */

import type { Surface } from '../kernel/types.ts';
import home from './home/index.ts';
import css_to_sass from './css-to-sass/index.ts';

export const SURFACES: Surface[] = [home, css_to_sass];

