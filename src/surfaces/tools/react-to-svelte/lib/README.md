# react-to-svelte/lib — the converter

React (TSX/JSX, function components and hooks) → Svelte 5 with runes, for the
fractalgpui workbench. Pure TypeScript on the Babel AST (`@babel/parser`,
`@babel/traverse`, `@babel/generator`, `@babel/types`); no GPUI and no Svelte at
runtime. The tool's UI (`../ReactToSvelte.svelte`) and state (`../state.svelte.ts`)
sit on top of it. Ported from fractaldesk's react2svelte surface, then rewritten.

```ts
import { react_to_svelte, ReactConvertError } from './lib/index.ts';

const { svelte, files, warnings } = react_to_svelte(tsx);
// files: [{ name: 'Card.svelte', code, warnings }, …], the default export first
```

- `convert.ts`: component discovery (functions, arrows, `memo`, `forwardRef`, default
  exports, several per file), props → `$props()`, hooks → runes, the body (derived
  values, early returns, local snippets), module-level code, file assembly.
- `jsx.ts`: JSX → template markup (blocks, each, snippets, DOM attribute and event
  names).
- `types.ts`: React types → Svelte types (`Snippet`, `svelte/elements`, DOM events).
- `gen.ts`: printing nodes back to source.

## What it does not do

Class components, custom hooks (kept, with a warning saying how to port them),
CSS-in-JS beyond a static `styled.tag\`…\`` (flagged), `useImperativeHandle`,
`<X.Consumer>`, and React-only runtime semantics such as concurrent rendering.
Every output file is compiled by the Svelte 5 compiler in `convert.test.ts`.
