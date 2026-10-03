import type { AnyComponent } from 'gpuix-svelte';

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
 * One workbench tool. Tools are self-contained: their page, state (a `.svelte.ts`
 * module, so it outlives the page and hot reloads) and commands live in
 * `src/tools/<id>/`; they reach the rest of the app only through the kernel.
 */
export interface ToolManifest {
	id: string;
	title: string;
	/** A short glyph for the rail (no icon font in GPUI yet). */
	glyph: string;
	description: string;
	component: AnyComponent;
	/** Registered while the app runs; grouped under the tool's title. */
	commands?: Command[];
}
