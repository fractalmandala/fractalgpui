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
| ⌘1 … ⌘9 | Switch to tool N in the rail |
| ⇧⌘L | Toggle light / dark |
| ⇧⌘C | CSS → Sass: copy the output |

Tools: **Home** (tools, roadmap, shortcuts, style-adapter report) and **CSS → Sass**
(paste CSS on the left; indented Sass on the right; options for nesting, `@media`
folding, comment style, indent; Copy goes to the macOS clipboard via `pbcopy`).

## Layout

| Path | Purpose |
|---|---|
| `app.ts` | Entry: `build/hot.ts` opens the window, remounts on `.svelte`/`.sass` saves in `src/` **and** in fractalstyler's styles. |
| `build/` | The fractalstyler → GPUI adapter (build time / load time, no UI). |
| `src/App.svelte` | Applies the theme (`set_css_vars`) and mounts the shell. |
| `src/kernel/` | Tool registry, commands + keymap + palette state, settings persistence, theme tokens, status, clipboard. |
| `src/shell/` | `Shell` (key handling, active tool), `ToolRail`, `StatusBar`, `CommandPalette`. |
| `src/ui/` | Shared bits: `Button`, `Kbd`. |
| `src/tools/<id>/` | One folder per tool: `index.ts` manifest, `state.svelte.ts`, page component, `test.ts` (headless), `lib/` (UI-free logic + `*.test.ts`). |
| `src/tools/index.ts` | Rail order. Adding a tool = a folder + one line here. |
| `src/styles/` | `index.sass` → `_own.sass`, the one place for app-only classes. |
| `test/` | `harness.ts`, `styles.ts` (strict style check), `shell.ts` (rail, keymap, palette, theme, persistence). |
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

- **Tools** are `ToolManifest`s (`src/kernel/types.ts`): id, title, glyph,
  description, component, commands. Their commands are registered at start-up and grouped
  under the tool's title in the palette.
- **Keep-alive**: the page component unmounts when you switch tools, but tool state lives
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

GPUI has no CSS engine: flexbox only, `px`, `:hover`/`:active`, `var(--token)`. No
`rem`, `box-shadow`, `transition`, descendant selectors or `margin: 0 auto` (the adapter
handles what it can and reports the rest). Use `{#if}` instead of `display: none`, put
`hitbox="self"` on clickable elements that contain children, and remember there is no
`bind:` (inputs report through `onchange`/`onsubmit` with `e.value`).

## Using `@gpui-native/svelte` instead

[gpui-native](https://github.com/countradooku/gpui-native) ships a different Svelte adapter (`@gpui-native/svelte`, Vite plugin, `Column` / `Text` / `Button` components). It is not on npm, so using it means building its Rust/Bun monorepo and running the app from inside that checkout. See its [Svelte guide](https://github.com/countradooku/gpui-native/blob/main/docs/svelte.md). This app uses `gpuix-svelte` because it installs and runs standalone.
