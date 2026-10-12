import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { SAMPLES } from '../samples.ts';
import { react_to_svelte, ReactConvertError, type ConversionResult } from './index.ts';

/**
 * The oracle: every file the converter writes must compile with the Svelte 5
 * compiler, with no warnings beyond the ones the React source asks for (a11y
 * findings about the original markup, and a $state seeded from a prop, which is
 * exactly useState's initial-value semantics).
 */
const ALLOWED = (code: string) => code.startsWith('a11y_') || code === 'state_referenced_locally';

function svelte(src: string): ConversionResult {
	const r = react_to_svelte(src);
	for (const f of r.files) {
		let warnings: { code: string; message: string }[] = [];
		try {
			warnings = compile(f.code, { filename: f.name, generate: 'client' }).warnings;
		} catch (err) {
			throw new Error(`${f.name} does not compile: ${(err as Error).message}\n\n${f.code}`);
		}
		const bad = warnings.filter((w) => !ALLOWED(w.code));
		if (bad.length) throw new Error(`${f.name}: ${bad.map((w) => `${w.code}: ${w.message}`).join('\n')}\n\n${f.code}`);
	}
	return r;
}
const main = (src: string) => svelte(src).svelte;

// Server-render converted files, to check what they actually produce.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, process.env.R2S_ROOT ?? '../../../../..');
const cache = join(root, 'node_modules/.cache/react-to-svelte-test');
// The app resolves 'svelte' to its client build (tsconfig customConditions); server-rendered output needs the server one.
const svelte_server = join(root, 'node_modules/svelte/src/index-server.js');
let run = 0;
async function render(r: ConversionResult, props: Record<string, unknown> = {}, file = r.files[0].name): Promise<string> {
	const dir = join(cache, String(run++));
	mkdirSync(dir, { recursive: true });
	for (const f of r.files) {
		const js = compile(f.code, { filename: f.name, generate: 'server' }).js.code.replace(/(from\s+['"]\.\/[\w$]+)\.svelte(['"])/g, '$1.svelte.js$2').replace(/from\s+['"]svelte['"]/g, `from '${svelte_server}'`);
		writeFileSync(join(dir, `${f.name}.js`), js);
	}
	const { render: ssr } = await import('svelte/server');
	const mod = await import(join(dir, `${file}.js`));
	const html = ssr(mod.default, { props }).body;
	return html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
}
const snippet = async (html: string) => ((await import(svelte_server)) as typeof import('svelte')).createRawSnippet(() => ({ render: () => html }));

describe('the stock samples', () => {
	for (const s of SAMPLES) {
		test(`${s.title} compiles cleanly`, () => {
			const r = svelte(s.source);
			expect(r.svelte).toContain('<script lang="ts"');
		});
	}
});

describe('props', () => {
	test('destructuring, defaults and a named Props type', () => {
		const out = main(SAMPLES[0].source);
		expect(out).toContain('let { name, excited = false }: GreetingProps = $props();');
		expect(out).toContain("{excited ? '!' : '.'}"); // simple string ternary stays inline
	});
	test('children is only declared when the component uses it', () => {
		expect(main(SAMPLES[1].source)).not.toContain('children');
	});
	test('inline and intersection prop types are kept, React types mapped', () => {
		expect(main(SAMPLES[3].source)).toContain('let { autoStart = true }: { autoStart?: boolean; } = $props();');
		const card = main(SAMPLES[4].source);
		expect(card).toContain('CardProps & HTMLAttributes<HTMLDivElement> = $props()');
		expect(card).toContain("import type { HTMLAttributes } from 'svelte/elements';");
		expect(card).toContain('footer?: Snippet;');
		expect(card).not.toContain('React.');
	});
	test('nested destructuring becomes a reactive destructure', () => {
		const out = main(`export default function A({ user: { name, age } = { name: '', age: 0 } }) { return <p>{name} {age}</p>; }`);
		expect(out).toContain("let { user = { name: '', age: 0 } } = $props();");
		expect(out).toContain('let { name, age } = $derived(user);');
	});
	test('a props object stays whole; props.children renders', async () => {
		const r = svelte(`export default function Box(props: { title: string; children?: React.ReactNode }) { return <div><h2>{props.title}</h2>{props.children}</div>; }`);
		expect(r.svelte).toContain('let props: { title: string; children?: Snippet; } = $props();');
		expect(r.svelte).toContain('{@render props.children?.()}');
		expect(await render(r, { title: 'T', children: await snippet('<i>kid</i>') })).toBe('<div><h2>T</h2><i>kid</i></div>');
	});
	test('defaultProps fold into the defaults', () => {
		const out = main(`function Tag({ tone }) { return <b>{tone}</b>; }\nTag.defaultProps = { tone: 'info' };\nexport default Tag;`);
		expect(out).toContain("let { tone = 'info' } = $props();");
		expect(out).not.toContain('defaultProps');
	});
	test('generic components get generics=', () => {
		const out = main(`export function List<T>({ items }: { items: T[] }) { return <ul>{items.map((x, i) => <li key={i}>{String(x)}</li>)}</ul>; }`);
		expect(out).toContain('<script lang="ts" generics="T">');
	});
});

describe('state and derived values', () => {
	test('useState keeps its type argument; setters become assignments', () => {
		const out = main(SAMPLES[2].source);
		expect(out).toContain('let todos = $state<Todo[]>([]);');
		expect(out).toContain("let filter = $state<'all' | 'open'>('all');");
		expect(out).toContain('todos = [...todos, {');
		expect(out).toContain('<input bind:value={text} placeholder="New todo" />');
	});
	test('values computed in the body from state or props → $derived', () => {
		const out = main(SAMPLES[7].source);
		expect(out).toContain('let results = $derived(onSearch(debounced));');
		const table = main(SAMPLES[6].source);
		expect(table).toMatch(/let sorted = \$derived\(state\.sortKey \?/);
	});
	test('constants that read nothing reactive stay const', () => {
		const out = main(`export default function A({ n }) { const max = 10; const over = n > max; return <p>{over ? 'over' : 'ok'}</p>; }`);
		expect(out).toContain('const max = 10;');
		expect(out).toContain('let over = $derived(n > max);');
	});
	test('a let reassigned during render folds into $derived.by', () => {
		const out = main(`export default function A({ error }) { let status = 'ok'; if (error) status = 'error'; return <p className={status}>{status}</p>; }`);
		expect(out).toContain("let status = $derived.by(() => {\n\t\tlet status = 'ok';\n\t\tif (error) status = 'error';\n\t\treturn status;\n\t});");
	});
	test('a setter passed as a value gets a setter function', () => {
		const out = main(`import { useState } from 'react';\nexport default function A() { const [v, setV] = useState<number>(0); return <Child onChange={setV} value={v} />; }`);
		expect(out).toContain('function setV(value: number | ((prev: number) => number)) {');
	});
	test('a setter shadowed inside a callback is left alone', () => {
		const out = main(`import { useState } from 'react';\nexport default function A() { const [v, setV] = useState(0); const f = (setV) => setV(1); return <button onClick={() => setV(2)}>{v}</button>; }`);
		expect(out).toContain('const f = setV => setV(1);');
		expect(out).toContain('onclick={() => v = 2}');
	});
	test('lazy initial state', () => {
		expect(main(`import { useState } from 'react';\nexport default function A() { const [v] = useState(() => 2 * 3); return <p>{v}</p>; }`)).toContain('let v = $state(2 * 3);');
	});
	test('useReducer: typed state and a dispatch', () => {
		const out = main(SAMPLES[6].source);
		expect(out).toContain('let state = $state<Parameters<typeof reducer>[0]>({ sortKey: null, asc: true });');
		expect(out).toContain('function dispatch(action: Parameters<typeof reducer>[1]) {');
	});
});

describe('effects and refs', () => {
	test('a mount-only effect → onMount; an effect that writes what it reads tracks only its deps', () => {
		const out = main(`import { useEffect, useState } from 'react';\nexport default function A() {\n const [n, setN] = useState(0);\n useEffect(() => { document.title = 'x'; }, []);\n useEffect(() => { if (n > 3) setN(n - 1); }, [n]);\n return <p>{n}</p>;\n}`);
		expect(out).toContain("onMount(() => {\n\t  document.title = 'x';\n\t});");
		expect(out).toContain('$effect(() => {\n\t\tn;\n\t\treturn untrack(() => {');
		expect(out).toContain("import { onMount, untrack } from 'svelte';");
	});
	test('an effect whose writes are in callbacks stays a plain $effect', () => {
		const out = main(SAMPLES[3].source);
		expect(out).toContain('$effect(() => {\n\t  if (!running) return;');
		expect(out).not.toContain('untrack');
	});
	test('non-DOM refs → plain let, .current dropped; DOM refs → bind:this state', () => {
		const out = main(SAMPLES[3].source);
		expect(out).toContain('let intervalRef: number | null = null;');
		expect(out).toContain('intervalRef = window.setInterval(');
		expect(out).not.toContain('.current');
		expect(out).toContain('let inputRef = $state<HTMLInputElement | null>(null);');
		expect(out).toContain('<input bind:this={inputRef} readonly value={seconds} />');
	});
	test('a callback ref that stores the element → bind:this', () => {
		const out = main(`import { useRef } from 'react';\nexport default function A() { const c = useRef<HTMLCanvasElement>(null); return <canvas ref={(el) => (c.current = el)} />; }`);
		expect(out).toContain('let c = $state<HTMLCanvasElement | null>(null);');
		expect(out).toContain('<canvas bind:this={c}></canvas>');
	});
	test('any other callback ref → {@attach}', () => {
		const r = svelte(`export default function A() { return <div ref={(el) => el && el.focus()} />; }`);
		expect(r.svelte).toContain('{@attach el => el && el.focus()}');
		expect(r.warnings.some((w) => w.includes('@attach'))).toBe(true);
	});
});

describe('templates', () => {
	test('early returns → an {#if}/{:else if} chain', async () => {
		const r = svelte(`export default function S({ loading, error, items }) {\n if (loading) return <p>Loading…</p>;\n if (error) return <p className="error">{error}</p>;\n return <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>;\n}`);
		expect(r.svelte).toContain('{#if loading}\n\t<p>Loading…</p>\n{:else if error}\n\t<p class="error">{error}</p>\n{:else}');
		expect(await render(r, { loading: true })).toBe('<p>Loading…</p>');
		expect(await render(r, { error: 'bad' })).toBe('<p class="error">bad</p>');
		expect(await render(r, { items: ['a', 'b'] })).toBe('<ul><li>a</li><li>b</li></ul>');
	});
	test('an early return null → {#if !…}', () => {
		const r = svelte(`export function Badge({ count }) { if (count === 0) return null; return <span>{count}</span>; }`);
		expect(r.svelte).toContain('{#if count !== 0}\n\t<span>{count}</span>\n{/if}');
	});
	test('.map callbacks keep their statements as {@const}', async () => {
		const r = svelte(SAMPLES[5].source.replace("import Avatar from './Avatar';", 'const Avatar = (p) => null;'));
		expect(r.svelte).toContain("{@const initials = u.name.split(' ').map(p => p[0]).join('')}");
		expect(r.svelte).toContain('{#each users as u, i (u.id)}');
	});
	test('.map callbacks that return null for some items', () => {
		const out = main(`export default function L({ xs }) { return <ul>{xs.map((x, i) => { if (i > 2) return null; return <li key={x}>{x}</li>; })}</ul>; }`);
		expect(out).toContain('{#each xs as x, i (x)}\n\t\t{#if !(i > 2)}\n\t\t\t<li>{x}</li>\n\t\t{/if}\n\t{/each}');
	});
	test('&&, || and ?? with markup', async () => {
		const r = svelte(`export default function A({ a, b, c }: { a?: boolean; b?: string; c?: string | null }) { return <div>{a && <i>a</i>}{b || <em>no b</em>}{c ?? <s>no c</s>}</div>; }`);
		expect(r.svelte).toContain('{#if b}\n\t\t{b}\n\t{:else}\n\t\t<em>no b</em>\n\t{/if}');
		expect(r.svelte).toContain('{#if c != null}');
		expect(await render(r, { a: true, b: '', c: 'C' })).toBe('<div><i>a</i> <em>no b</em> C</div>');
	});
	test('null and false branches vanish', () => {
		const out = main(SAMPLES[4].source);
		expect(out).toContain('{#if footer}\n\t\t<footer>{@render footer?.()}</footer>\n\t{/if}');
		expect(out).not.toContain('{null}');
	});
	test('a ternary of plain values stays inline; one with markup becomes blocks', () => {
		const out = main(`export default function A({ on }) { return <p>{on ? 'On' : 'Off'} {on ? <b>yes</b> : <i>no</i>}</p>; }`);
		expect(out).toContain("{on ? 'On' : 'Off'}");
		expect(out).toContain('{#if on}');
	});
	test('fragments, keyed fragments in .map', () => {
		const out = main(`import { Fragment } from 'react';\nexport default function D({ rows }) { return <dl>{rows.map((r) => <Fragment key={r.k}><dt>{r.k}</dt><dd>{r.v}</dd></Fragment>)}</dl>; }`);
		expect(out).toContain('{#each rows as r (r.k)}');
		expect(out).toContain('<dt>{r.k}</dt><dd>{r.v}</dd>');
	});
	test('inline text, elements and {" "} spacing', async () => {
		const r = svelte(`export default function A({ name }) { return <p>Hello, <b>{name}</b>!{' '}<a href="/x">more</a> &middot; end</p>; }`);
		expect(await render(r, { name: 'Amrit' })).toBe('<p>Hello, <b>Amrit</b>! <a href="/x">more</a> · end</p>');
	});
	test('attribute strings with braces or quotes are written as expressions', () => {
		const out = main(`export default function A() { return <input pattern="[a-z]{2}" title='say "hi"' />; }`);
		expect(out).toContain('pattern={"[a-z]{2}"}');
		expect(out).toContain('title={"say \\"hi\\""}');
	});
});

describe('events and DOM attributes', () => {
	test('onChange → oninput on text fields, onchange on checkbox/select, unchanged on components', () => {
		const out = main(`export default function F({ set }) { return <form><input onChange={(e) => set(e.target.value)} /><input type="checkbox" onChange={() => set('x')} /><select onChange={(e) => set(e.target.value)}><option>a</option></select><Picker onChange={set} onClick={set} className="p" /></form>; }`);
		expect(out).toContain('<input oninput={e => set(e.target.value)} />');
		expect(out).toContain('<input type="checkbox" onchange={() => set(\'x\')} />');
		expect(out).toContain('<select onchange={e => set(e.target.value)}>');
		expect(out).toContain('<Picker onChange={set} onClick={set} className="p" />');
	});
	test('className, htmlFor, SVG camelCase, style objects on DOM elements', () => {
		const out = main(`export default function I({ c, w }) { return <label htmlFor="x" className={c} style={{ marginTop: 4, opacity: 0.5, width: w, '--gap': 2 }}><svg viewBox="0 0 1 1"><path strokeWidth={2} fillRule="evenodd" /></svg></label>; }`);
		expect(out).toContain('<label for="x" class={c} style="margin-top: 4px; opacity: 0.5; width: {w}; --gap: 2">');
		expect(out).toContain('<path stroke-width={2} fill-rule="evenodd"></path>');
	});
	test('onDoubleClick → ondblclick', () => {
		expect(main(`export default function A({ f }) { return <div onDoubleClick={f} />; }`)).toContain('ondblclick={f}');
	});
});

describe('snippets', () => {
	test('children and ReactNode props render with {@render}', async () => {
		const r = svelte(SAMPLES[4].source);
		expect(r.svelte).toContain('{@render children?.()}');
		const html = await render(r, { title: 'Hi', children: await snippet('<p>body</p>'), footer: await snippet('<span>f</span>') });
		expect(html).toBe('<section class="card card-plain"><header><h2>Hi</h2> </header> <p>body</p> <footer><span>f</span></footer></section>');
	});
	test('render props (typed or render*) → {@render fn(args)}', () => {
		const out = main(SAMPLES[6].source);
		expect(out).toContain('{#if renderEmpty}\n\t\t\t\t\t\t{@render renderEmpty()}\n\t\t\t\t\t{:else}\n\t\t\t\t\t\tNo rows\n\t\t\t\t\t{/if}');
		expect(out).toContain('{@render c.render(r)}');
		expect(out).toContain('render?: Snippet<[Row]>;');
	});
	test('function children and JSX props passed to a component → {#snippet}', () => {
		const out = main(`export default function A({ items }) { return <List items={items} footer={<b>end</b>} renderItem={(x: string) => <i>{x}</i>}>{(item) => <b>{item}</b>}</List>; }`);
		expect(out).toContain('{#snippet footer()}\n\t\t<b>end</b>\n\t{/snippet}');
		expect(out).toContain('{#snippet renderItem(x)}\n\t\t<i>{x}</i>\n\t{/snippet}');
		expect(out).toContain('{#snippet children(item)}\n\t\t<b>{item}</b>\n\t{/snippet}');
	});
	test('JSX in variables and render helpers → local snippets', async () => {
		const r = svelte(`export default function A({ err, label }) { const hint = <small>{label}</small>; const renderErr = (m: string) => <p role="alert">{m}</p>; return <div>{err ? renderErr(err) : hint}</div>; }`);
		expect(r.svelte).toContain('{#snippet hint()}');
		expect(r.svelte).toContain('{#snippet renderErr(m)}');
		expect(await render(r, { err: 'x', label: 'L' })).toBe('<div><p role="alert">x</p></div>');
		expect(await render(r, { label: 'L' })).toBe('<div><small>L</small></div>');
	});
});

describe('components', () => {
	test('forwardRef: the ref is a $bindable prop bound to the element', () => {
		const out = main(SAMPLES[6].source);
		expect(out).toContain('ref = $bindable(null) }: { rows: Row[]; columns: Col[]; renderEmpty?: Snippet; } & { ref?: HTMLTableElement | null } = $props();');
		expect(out).toContain('<table bind:this={ref}>');
	});
	test('export default forwardRef(function …) and memo(…)', () => {
		const r = svelte(`import { forwardRef, memo } from 'react';\nexport default memo(forwardRef<HTMLButtonElement, { label: string }>(function Btn({ label }, ref) { return <button ref={ref}>{label}</button>; }));`);
		expect(r.files.map((f) => f.name)).toEqual(['Btn.svelte']);
		expect(r.svelte).toContain('<button bind:this={ref}>{label}</button>');
	});
	test('several components → several files, the default export first, imported where used', async () => {
		const r = svelte(`function Item({ label }) { return <li>{label}</li>; }\nconst Empty = () => <p>none</p>;\nexport default function L({ xs }) { return xs.length ? <ul>{xs.map((x) => <Item key={x} label={x} />)}</ul> : <Empty />; }`);
		expect(r.files.map((f) => f.name)).toEqual(['L.svelte', 'Item.svelte', 'Empty.svelte']);
		expect(r.svelte).toContain("import Item from './Item.svelte';");
		expect(r.svelte).toContain("import Empty from './Empty.svelte';");
		expect(await render(r, { xs: ['a'] })).toBe('<ul><li>a</li></ul>');
		expect(await render(r, { xs: [] })).toBe('<p>none</p>');
	});
	test('relative default imports used as components point at .svelte', () => {
		expect(main(SAMPLES[5].source)).toContain('import Avatar from "./Avatar.svelte";');
	});
	test('named component imports are flagged', () => {
		expect(svelte(`import { Select } from './Select';\nexport default function A() { return <Select />; }`).warnings.join()).toContain('named import');
	});
});

describe('context', () => {
	test('createContext + Provider → setContext with getters; useContext → getContext ?? default', async () => {
		const r = svelte(`import { createContext, useContext, useState } from 'react';\ntype Theme = { dark: boolean };\nexport const ThemeContext = createContext<Theme>({ dark: false });\nexport function Label() { const t = useContext(ThemeContext); return <span>{t.dark ? 'Dark' : 'Light'}</span>; }\nexport default function Provider({ children }) { const [dark] = useState(true); return <ThemeContext.Provider value={{ dark }}><Label />{children}</ThemeContext.Provider>; }`);
		expect(r.svelte).toContain("export const ThemeContext = Symbol.for('ThemeContext');");
		expect(r.svelte).toContain('setContext(ThemeContext, {\n\t\tget dark() {\n\t\t\treturn dark;\n\t\t}\n\t});');
		expect(r.files[1].code).toContain('getContext<Theme>(ThemeContext) ?? { dark: false }');
		expect(await render(r, {})).toBe('<span>Dark</span>');
		expect(await render(r, {}, 'Label.svelte')).toBe('<span>Light</span>');
	});
	test('useId → $props.id()', () => {
		expect(main(`import { useId } from 'react';\nexport default function A() { const id = useId(); return <label htmlFor={id}>x</label>; }`)).toContain('const id = $props.id();');
	});
});

describe('CSS-in-JS and custom hooks', () => {
	test('a static styled.tag → the tag with a scoped class and a <style> block', () => {
		const out = main(SAMPLES[7].source);
		expect(out).toContain('<div class="box">');
		expect(out).toContain('<style>\n\t.box {');
		expect(out).not.toContain('styled-components');
	});
	test('styled with interpolations, css props and CSS modules are flagged', () => {
		const r = svelte(`import styled from 'styled-components';\nimport s from './a.module.css';\nconst W = styled.div\`padding: \${(p) => p.pad}px;\`;\nexport default function A() { return <W pad={2}><p className={s.x} css={{ color: 'red' }}>x</p></W>; }`);
		const w = r.warnings.join('\n');
		expect(w).toContain('interpolates props');
		expect(w).toContain('CSS module');
		expect(w).toContain('`css` prop');
	});
	test('custom hooks are kept and explained', () => {
		const r = svelte(SAMPLES[7].source);
		expect(r.warnings.join()).toContain('useDebounce() is a custom React hook');
	});
	test('named export lists do not re-export generated Svelte components', () => {
		const r = svelte(`import { useState } from 'preact/hooks';\nconst DropdownMenu = () => { const [open] = useState(false); return <div>{open ? 'open' : 'closed'}</div>; };\nexport { DropdownMenu };`);
		expect(r.svelte).not.toContain('export { DropdownMenu }');
		expect(r.files[0].name).toBe('DropdownMenu.svelte');
	});
	test('external custom hooks remain in the component while supported hooks convert', () => {
		const r = svelte(`import { useEffect } from 'react';\nimport { useAppStore } from './store';\nexport default function EditorApp() {\n const screen = useAppStore((state) => state.screen);\n useEffect(() => { document.title = screen; }, [screen]);\n return <div>{screen}</div>;\n}`);
		expect(r.svelte).toContain('const screen = useAppStore(state => state.screen);');
		expect(r.svelte).toContain('$effect(() =>');
		expect(r.warnings.join()).toContain('useAppStore() is a custom React hook');
	});
});

describe('legacy class components', () => {
	test('constructor state, props, methods and bound handlers convert', () => {
		const out = main(`import { Component } from 'preact';\nexport default class AddLibrary extends Component {\n constructor(props) { super(props); this.state = { value: props.initial || '', untouched: true }; }\n update(e) { this.setState((previous) => ({ value: e.target.value })); }\n render() { return <input value={this.state.value} onChange={this.update.bind(this)} />; }\n}`);
		expect(out).toContain('let __state = $state({ value: props.initial || \'\', untouched: true });');
		expect(out).toContain('...__previousState');
		expect(out).toContain('value: e.target.value');
		expect(out).toContain('oninput={update}');
		expect(out).not.toContain('this.');
		expect(out).not.toContain('.bind(this)');
	});
	test('class render locals can reuse the name props', () => {
		const out = main(`import { Component } from 'preact';\nclass Clickable extends Component {\n handleClick() { this.props.onClick?.(); }\n render() { const { onClick, ...props } = this.props; return <button onClick={this.handleClick.bind(this)} {...props} />; }\n}`);
		expect(out).toContain('let props2 = $props();');
		expect(out).toContain('let { onClick, ...props } = $derived(props2);');
		expect(out).not.toContain('this.');
	});
	test('render-only classes convert and shouldComponentUpdate is warned', () => {
		const r = svelte(`import { Component } from 'preact';\nexport class Alerts extends Component {\n shouldComponentUpdate() { return false; }\n render() { return <div className="alerts" />; }\n}`);
		expect(r.svelte).toContain('<div class="alerts"></div>');
		expect(r.warnings.join()).toContain('shouldComponentUpdate has no direct Svelte equivalent');
	});
	test('mount and unmount lifecycle methods become a mount effect with cleanup', () => {
		const out = main(`import React, { Component } from 'react';\nexport default class A extends Component {\n componentDidMount() { document.title = 'ready'; }\n componentWillUnmount() { document.title = ''; }\n render() { return <p>ready</p>; }\n}`);
		expect(out).toContain('onMount(() =>');
		expect(out).toContain('return () => {');
	});
	test('unsupported lifecycle behavior is rejected explicitly', () => {
		expect(() => react_to_svelte(`import React, { Component } from 'react';\nexport default class A extends Component {\n componentDidUpdate() { document.title = 'updated'; }\n render() { return <p />; }\n}`)).toThrow('componentDidUpdate has no safe Svelte equivalent');
	});
});

describe('errors', () => {
	test('a syntax error carries its line', () => {
		try {
			react_to_svelte('export default function A() {\n  const x = ;\n  return <p />;\n}');
			throw new Error('no throw');
		} catch (err) {
			expect(err).toBeInstanceOf(ReactConvertError);
			expect((err as ReactConvertError).line).toBe(2);
		}
	});
	test('utility-only modules are rejected as non-components', () => {
		expect(() => react_to_svelte('export type Point = { x: number; y: number };\nexport const x = 1;')).toThrow('contains no JSX component');
	});
});

afterAll(() => rmSync(cache, { recursive: true, force: true }));
