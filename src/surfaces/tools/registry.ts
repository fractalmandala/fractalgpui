/**
 * Every tool in the Tools surface, in list order. Adding a tool = a folder under
 * `src/surfaces/tools/` whose `index.ts` exports a `Tool`, plus one line here.
 */

import css_to_sass from './css-to-sass/index.ts';
import type { Tool } from './types.ts';

export const TOOLS: Tool[] = [css_to_sass];
