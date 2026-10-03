# css-to-sass/lib — the converter

CSS → indented Sass (`.sass`) for the fractalgpui workbench. Pure TypeScript, no
runtime dependencies, no GPUI and no Svelte: it runs anywhere Bun/Node runs. The
tool's UI (`../CssToSass.svelte`) and state (`../state.svelte.ts`) sit on top of it.

```ts
import { css_to_sass } from './lib/index.ts';

const { sass, warnings, stats } = css_to_sass(css, {
	indent: '\t', // default
	nest: true, // nest selectors that share a prefix (default)
	nestMedia: true, // fold `@media` for the selector just written into it (default)
	comments: 'silent' // 'silent' → `//`, 'loud' → `/* */`, 'drop'; `/*! */` is always kept
});
```

## Guarantees

- **Order-preserving nesting.** A rule nests only under the chain of the rule written
  just before it, so the compiled CSS has the source order and the cascade cannot
  change. `.a{} .b{} .a:hover{}` stays three blocks; `.a{} .a:hover{}` nests.
  Shared prefixes (`.nav a`, `.nav a:hover`) open an empty parent only when the next
  rule shares them.
- **Indented-syntax safe.** Nested lines that would read as Sass syntax get `&`
  (`& + .b`, `& :focus`); `#{` in values is escaped.
- **Honest errors.** Unclosed blocks/strings/comments, stray `}` and declarations
  without a colon throw `CssParseError` with `line`/`column`. Dropped input (IE `*hacks`,
  top-level declarations) is listed in `warnings`.
- Handles strings, escapes, `url(data:…;…)`, `:is()/:not()` with spaces, attribute
  selectors, `!important`, custom properties, multi-line values (collapsed to one line),
  `@media/@supports/@container/@layer` (nested through the same pass), `@font-face`,
  `@keyframes`, `@page`, statement at-rules, and native CSS nesting input.

## Tests

```bash
bun install   # dev only: sass (the round-trip oracle), typescript, @types/bun
bun test      # every fixture compiles back to what Sass makes of the original CSS
```
