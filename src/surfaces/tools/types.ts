/**
 * A tool inside the Tools surface. Self-contained in `src/surfaces/tools/<id>/`: its
 * `index.ts` exports a `Tool`, its state lives in a `.svelte.ts` module (so it outlives
 * the page), UI-free logic in `lib/`. The Tools surface hosts it:
 *
 * - `component` fills section-main's body (under the tab row, if any);
 * - `toolbar` goes in section-main's header while the tool is selected;
 * - `sidebar` goes in section-sidebar-left's body, under the tool list;
 * - `tabs` become the surface's tab row (⌃⇥ cycles them);
 * - `commands` are registered app-wide; running one selects the tool first.
 */

import type { AnyComponent } from 'gpuix-svelte';
import type { Command } from '../../kernel/types.ts';
import type { IconName } from '../../ui/icons.ts';
import type { Tab } from '../../ui/types.ts';

export interface Tool {
	id: string;
	title: string;
	icon: IconName;
	description: string;
	component: AnyComponent;
	toolbar?: AnyComponent;
	sidebar?: AnyComponent;
	tabs?: { list: () => Tab[]; value: () => string; select: (id: string) => void };
	commands?: Command[];
	/** Runs once, the first time the tool is shown. */
	load?: () => void | Promise<void>;
}
