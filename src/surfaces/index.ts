/**
 * Every view, in `⌘1…⌘9` order. Adding a view = a folder under `src/surfaces/` whose
 * `index.ts` exports a `View` (or a list of them), plus one line here. (Tools go inside the
 * Tools view: see `tools/registry.ts`.)
 */

import type { View } from '../kernel/types.ts';
import agents from './agents/index.ts';
import bots from './bots/index.ts';
import settings from './settings/index.ts';
import tools from './tools/index.ts';

const [chat, sessions, side] = agents;

/** ⌘1 chat, ⌘2 sessions, ⌘3 bots, ⌘4 bot editor, ⌘5 tools, ⌘6 settings, ⌘7 side chat. */
export const VIEWS: View[] = [chat, sessions, ...bots, tools, settings, side];
