import type { AnyComponent } from 'gpuix-svelte';
import type { IconName } from '../ui/icons.ts';
import type { Tab } from '../ui/types.ts';
import type { Widths } from './layout.svelte.ts';

/** Something the user can do: from the palette, a keybinding, or a button. */
export interface Command {
	/** Stable id, `area.verb`, e.g. `theme.toggle`. */
	id: string;
	title: string;
	/** Shown before the title in the palette, e.g. the tool name. */
	group?: string;
	/** A GPUI-style keystroke: `cmd-k`, `cmd-shift-l`, `escape`. */
	keys?: string;
	run(): void;
	/** Hidden from the palette and keymap while this returns false. */
	enabled?(): boolean;
}

/**
 * One workbench surface (tool). Self-contained: its page, state (a `.svelte.ts`
 * module, so it outlives the page and hot reloads) and commands live in
 * `src/tools/<id>/`; it reaches the rest of the app only through the kernel. The
 * shell shows a panel only when the surface fills its slot.
 */
export interface ToolManifest {
	id: string;
	title: string;
	icon: IconName;
	description: string;
	/** The centre content. */
	component: AnyComponent;
	/** Context under the nav in the left sidebar. */
	left?: AnyComponent;
	/** Right-hand config panel, titled `inspectorTitle` (default "Inspector"). */
	inspector?: AnyComponent;
	inspectorTitle?: string;
	/** The agent panel body: omitted = the shared agent panel; `false` = no agent panel. */
	agent?: AnyComponent | false;
	/** Actions in the title bar, right of the title. */
	toolbar?: AnyComponent;
	/** A tab row above the content; the surface keeps the value in its state. */
	tabs?: { list: () => Tab[]; value: () => string; select: (id: string) => void };
	/** Default panel widths until the user resizes them on this surface. */
	layout?: Widths;
	/** A pill on the nav item (a count, "new"). */
	badge?: () => string | number | null;
	/** Registered while the app runs; grouped under the surface's title. */
	commands?: Command[];
}
