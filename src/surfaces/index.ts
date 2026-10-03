/**
 * Every surface, in nav order. Adding a surface = a folder under `src/surfaces/` with
 * an `index.ts` manifest, plus one line here. (Tools go inside the Tools surface:
 * see `tools/registry.ts`.)
 */

import type { Surface } from '../kernel/types.ts';
import home from './home/index.ts';
import tools from './tools/index.ts';

export const SURFACES: Surface[] = [home, tools];

