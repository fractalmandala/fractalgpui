import type { AnyComponent } from 'gpuix-svelte';
import type { IconName } from '../ui/icons.ts';

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
 * One view: an independent feature that can be docked anywhere in the layout tree
 * (kernel/dock). Self-contained: its component, state (a `.svelte.ts` module, so it
 * outlives the pane and hot reloads) and commands live in `src/surfaces/<id>/`; it reaches
 * the rest of the app only through the kernel. A view fills whatever pane it is in, so it
 * may not assume a size or a neighbour. Each view appears at most once in the layout.
 */
export interface View {
	id: string;
	title: string;
	icon: IconName;
	description: string;
	/** The pane's content. */
	component: AnyComponent;
	/** Actions shown at the right of the pane header while this view is the active tab. */
	toolbar?: AnyComponent;
	/** Registered while the app runs; grouped under the view's title. */
	commands?: Command[];
	/** Runs once, the first time the view is shown (lazy data loading). */
	load?: () => void | Promise<void>;
}
