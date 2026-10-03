# fractalgpui — the Fractal workbench

A native desktop workbench of small design-dev tools: **Svelte 5 components painted by
[GPUI](https://www.gpui.rs/)** through [`gpuix-svelte`](https://github.com/khromov/gpuix-svelte)
0.7 (no webview, no DOM), **styled by fractalstyler**, run on **Bun**.

```bash
npm install            # once; npm lockfile is the source of truth (Bun only runs things)
npm start              # = gpuix-svelte --bun app.ts   — opens the window, hot-reloads
npm test               # = gpuix-svelte --bun test.ts  — headless suites + bun test
npm run typecheck      # tsc --noEmit
```

Needs Bun ≥ 1.4 on `PATH` (tested with `~/.bun/bin/bun` 1.4.2) because the scripts pass
`--bun`. Settings live in `~/Library/Application Support/fractalgpui/settings.json`
(`FRACTALGPUI_DATA_DIR` overrides it).

## Using it

| Keys | Does |
|---|---|
| ⌘K | Command palette (type to filter, ↑/↓, ⏎, esc) |
| ⌘1 … ⌘9 | Switch to surface N |
| ⌘B | Left sidebar ↔ icon rail |
| ⌘J / ⌘I | Right container A / B |
| ⌘\\ | Close / reopen every panel |
| ⌃⇥ / ⌃⇧⇥ | Next / previous tab |
| ⇧⌘L | Toggle light / dark |
| ⇧⌘C | CSS → Sass: copy the output |

Window: left sidebar (surface nav + the surface's own context; collapses to a 52px
rail) | title bar, tabs, surface, status bar | right container A | right container B.
The right containers are generic and empty unless the surface fills them. Every panel
is resizable by its splitter (double-click resets), widths are kept per surface, and
panels that don't fit the window drop out (B first) without changing your choice.

Surfaces: **Home** (a card per surface) and **CSS → Sass** (paste CSS left, indented
Sass right, an options row for nesting, `@media` folding, comments and indent; samples
and recent inputs in the left sidebar; a **Diff** tab comparing the input with the Sass
compiled back to CSS; Copy goes to the macOS clipboard via `pbcopy`). Style-adapter
warnings show in the status bar (click for detail, or "Show style diagnostics").

## Layout

| Path | Purpose |
|---|---|
| `app.ts` | Entry: `build/hot.ts` opens the window, remounts on `.svelte`/`.sass` saves in `src/` **and** in fractalstyler's styles. |
| `build/` | The fractalstyler → GPUI adapter (build time / load time, no UI). |
| `src/App.svelte` | Applies the theme (`set_css_vars`) and mounts the shell. |
| `src/kernel/` | Surface registry, commands + keymap + palette state, panel layout (`layout.svelte.ts`), window size, typed bus, settings persistence, theme tokens, status, clipboard. |
| `src/shell/` | `Shell` (regions, key handling), `LeftSidebar`, `TitleBar`, `RightPanel` (a generic container), `StatusBar`, `CommandPalette`. |
| `src/ui/` | Primitives: `Icon` (Lucide SVGs in `assets/icons`), `IconButton`, `Button`, `Tabs`, `Segmented`, `Toggle`, `Pill`, `Card`, `SectionLabel`, `PanelHeader`, `Splitter`, `Kbd`. |
| `src/surfaces/<id>/` | One folder per surface: `index.ts` manifest, `state.svelte.ts`, components, `test.ts` (headless), `lib/` (UI-free logic + `*.test.ts`). |
| `src/surfaces/index.ts` | Nav order. Adding a surface = a folder + one line here. |
| `src/styles/` | `index.sass` → `_own.sass`, the one place for app-only classes. |
| `test/` | `harness.ts`, `styles.ts` (strict style check), `ui.ts` (primitives), `layout.ts` (panel state), `panels.ts` (collapse, resize), `shell.ts` (nav, Home, keymap, palette, theme, persistence). |
| `test.ts` | Runs every headless suite in its own process, then `bun test ./src`. |
| `vendor/` | The custom-renderer Svelte build `gpuix-svelte` requires. |

## Styling: fractalstyler through an adapter

fractalstyler is read, never modified. `build/styles.ts` does, on start and every reload:

1. **Compile fractalstyler from `packages/fractalstyler/src/lib/styles`** (src, not the
   stale `dist`). Its `index.sass` first; if that fails (it does mid-refactor), all
   `_NN_*` partials in order; if that fails, each partial alone. Fallbacks show as a
   warning in the console and on Home. `FRACTALSTYLER_STYLES` points elsewhere.
2. **Flatten tokens** (`build/tokens.ts`): nested `var()`, `calc()` and `rem` → px
   (base 16), into a light and a dark map for `set_css_vars`. The app's own `:root`
   (in `_own.sass`) adds app tokens, including `--font-mono`, which fractalstyler lacks.
3. **Translate rules** (`build/gpui-css.ts`) to gpuix `ClassRule`s with the same class
   names: `background` → `background-color`, border shorthands split, `flex` → grow/
   shrink/basis, logical padding/margin → sides, `repeat(N, …)` → N, `overflow: auto` →
   scroll, unitless line-height → px. Things GPUI cannot express are dropped and
   recorded as losses: `@media`, shadows, transitions, descendant/sibling selectors,
   pseudo-classes other than `:hover`/`:active`, `auto` margins, `space-evenly`…
4. **Prune** to rules whose classes all appear in `src/**/*.svelte` (`build/used-classes.ts`
   reads the Svelte AST), and register them with `define_styles`.

`test/styles.ts` is the **strict check**: it fails on any class the app uses that no
sheet defines, on any loss touching a used class (and a used element name) unless
listed with a reason in `build/allow.ts`, and on *any* loss in `_own.sass`.

Rules of the road (fractalstyler's closed world):

- Compose fractalstyler classes in markup. No `<style>` blocks, no inline `style`.
- App-only classes go in `src/styles/_own.sass`, prefixed `wb-`.
- **Write class names literally** (`class:active`, `'text-danger'`), never built from
  strings at runtime, or pruning and the check cannot see them.
- `@media` never reaches GPUI, so responsive classes (e.g. `grid-N`'s breakpoints)
  behave as their base rule; lay out with `row`/`box`/`wrap` instead.

## Kernel notes

- **Surfaces** are `Surface`s (`src/kernel/types.ts`): id, title, icon, description,
  component, and optional slots: `left` (sidebar context), `toolbar` (title bar),
  `tabs`, `panels.rightA` / `panels.rightB` (`{ header?, body? }` for the right
  containers), `layout` (default widths), `badge`, `commands`, `load()` (runs once on
  first show). Commands are registered at start-up and grouped under the title.
- **Bus** (`kernel/bus.ts`, events typed in `kernel/events.ts`): surfaces talk through
  it, never by importing each other. `surface:switch` is sent on every switch.
- **Keep-alive**: the page component unmounts when you switch surfaces, but state lives
  in its `state.svelte.ts` module (`persisted(...)`), so it survives switching, hot
  reloads and restarts.
- **Settings**: `persisted(key, defaults)` gives a deep `$state`; changes are written
  400 ms after the last edit (tmp file + rename), and on exit. A corrupt file is moved
  aside, not lost.
- **Clipboard**: gpuix 0.7 gives JS no clipboard, so `copy_text` shells out to `pbcopy`
  (text fields still have native ⌘C/⌘V). Tests use `FRACTALGPUI_CLIPBOARD=memory`.
- App code uses `node:` APIs only (no `@types/bun`), so it still runs under Node.

## Why the dependencies look unusual

- `gpuix-svelte` on npm is only a `0.0.1` placeholder, so it is pinned to a git commit.
- `gpuix-svelte` only works with a specific unreleased Svelte build (custom renderer API). Normally it ships that inside itself, but a git install does not unpack bundled dependencies, so the same tarball is vendored in `vendor/` and installed as `svelte`. Do not replace it with the registry `svelte`: same version number, none of the API.
- When `gpuix-svelte` is published properly, drop `vendor/` and the `svelte` dependency, and point the `svelte` paths in `tsconfig.json` at `./node_modules/gpuix-svelte/node_modules/svelte`.

## GPUI limits worth knowing

GPUI has no CSS engine: flexbox only, no window resize event (`kernel/window.svelte.ts` polls),
fonts by installed family name only ("General Sans Variable"), `<svg src>` for tintable
icons, and `<code>`'s highlighter assumes a dark background (no `sass` grammar);, `px`, `:hover`/`:active`, `var(--token)`. No
`rem`, `box-shadow`, `transition`, descendant selectors or `margin: 0 auto` (the adapter
handles what it can and reports the rest). Use `{#if}` instead of `display: none`, put
`hitbox="self"` on clickable elements that contain children, and remember there is no
`bind:` (inputs report through `onchange`/`onsubmit` with `e.value`).

## Using `@gpui-native/svelte` instead

[gpui-native](https://github.com/countradooku/gpui-native) ships a different Svelte adapter (`@gpui-native/svelte`, Vite plugin, `Column` / `Text` / `Button` components). It is not on npm, so using it means building its Rust/Bun monorepo and running the app from inside that checkout. See its [Svelte guide](https://github.com/countradooku/gpui-native/blob/main/docs/svelte.md). This app uses `gpuix-svelte` because it installs and runs standalone.
