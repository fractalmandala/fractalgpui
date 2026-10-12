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
- `class-to-function.ts`: conservative React/Preact class lowering for constructor
  state, props, methods, merged `setState`, common handlers, and mount cleanup.
- `jsx.ts`: JSX → template markup (blocks, each, snippets, DOM attribute and event
  names).
- `types.ts`: React types → Svelte types (`Snippet`, `svelte/elements`, DOM events).
- `gen.ts`: printing nodes back to source.

## Legacy classes and edge cases

Common React/Preact class components are lowered to function components before the
normal conversion pipeline runs. The supported subset includes constructor state,
`this.props`, `this.state`, merged object/functional `this.setState`, instance
methods and fields, `.bind(this)` handlers, `componentDidMount`, and
`componentWillUnmount`. `shouldComponentUpdate` is dropped with a warning because
Svelte has no direct equivalent.

Lifecycle methods whose semantics cannot be mapped safely (`componentDidUpdate`,
derived-state methods, error-boundary methods, legacy context, and dynamic/private
class members) reject the class with an explicit diagnostic instead of producing
misleading output. Imperative DOM code and async work can still require manual
review after conversion.

A file containing only types, constants, or ordinary functions is not a component and
is rejected with a utility-module diagnostic; it is not wrapped in an empty
`.svelte` file. External custom hooks are retained and reported with a warning. For
example, a `useAppStore(selector)` call remains in the generated component because
the converter cannot infer the store's subscription or rune semantics; port that hook
separately to a `.svelte.ts` module.

CSS-in-JS beyond a static `styled.tag\`…\`` is flagged, as are `useImperativeHandle`,
`<X.Consumer>`, and React-only runtime semantics such as concurrent rendering.
Every output file is compiled by the Svelte 5 compiler in `convert.test.ts`.

## Batch conversion

From `apps/fractalgpui`, convert a folder tree of JSX/TSX components into a mirrored
folder tree of Svelte files:

```sh
bun run convert:react -- /path/to/react-components /path/to/svelte-components
```

The command writes every generated component file, preserves converter warnings, and
copies ordinary `.js`/`.mjs`/`.ts` modules as `.ts` files. React-bearing `.js` files
still become `.svelte`. Relative imports with explicit JavaScript extensions are
updated to `.ts`. It refuses to overwrite existing `.svelte` or `.ts` files unless
`--overwrite` is supplied. Use `--dry-run` to inspect results, or `--include-js` to
also scan `.js`, `.mjs`, and `.ts` files (the default scans `.jsx` and `.tsx`).
