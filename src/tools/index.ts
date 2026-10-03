/**
 * Every workbench tool, in rail order. Adding a tool = a folder under `src/tools/`
 * with an `index.ts` manifest, plus one line here.
 */

import type { ToolManifest } from '../kernel/types.ts';
import home from './home/index.ts';
import css_to_sass from './css-to-sass/index.ts';

export const TOOLS: ToolManifest[] = [home, css_to_sass];
