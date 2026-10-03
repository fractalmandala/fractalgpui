/**
 * The converter's state, both directions: CSS → Sass (our converter, `lib/`) and
 * Sass → CSS (dart-sass, the `sass` package the style build already uses). Each
 * direction keeps its own input, samples and recent inputs. A module (not component) `$state`, persisted to disk, so
 * the input survives switching tools, hot reloads and restarts.
 */

import { compileString } from 'sass';
import { css_to_sass, CssParseError, type ConvertResult } from './lib/index.ts';
import { unified, type Unified } from './lib/diff.ts';
import { copy_text } from '../../../kernel/clipboard.ts';
import { persisted } from '../../../kernel/storage.svelte.ts';
import { flash } from '../../../kernel/status.svelte.ts';

export type Comments = 'silent' | 'loud' | 'drop';
export type Indent = 'tab' | '2' | '4';
export type Direction = 'css-to-sass' | 'sass-to-css';
/** Sass → CSS input syntax: `auto` picks SCSS when the input has braces outside `#{…}`. */
export type Syntax = 'auto' | 'indented' | 'scss';
export type OutputStyle = 'expanded' | 'compressed';

export const SAMPLE = `/* Buttons */
.btn { display: inline-flex; gap: 8px; padding: 8px 16px; border-radius: 6px }
.btn:hover { background: #f4f4f5 }
.btn.primary { background: #ff4400; color: #fff }
.btn.primary:hover { background: #ff9966 }
.btn > .icon { width: 16px; height: 16px }

.card { padding: 24px; border: 1px solid #d8d8d8 }
.card .title, .card .subtitle { margin: 0 }
.card .title { font-weight: 600 }
@media (min-width: 768px) { .card .title { font-size: 20px } }

@keyframes pulse { from { opacity: 1 } to { opacity: .5 } }
`;

/** Starting points, listed in the left sidebar. */
export const SAMPLES: { id: string; title: string; css: string }[] = [
	{ id: 'components', title: 'Buttons and cards', css: SAMPLE },
	{
		id: 'layout',
		title: 'Responsive layout',
		css: `.page { display: grid; grid-template-columns: 1fr; gap: 16px }
.page > header { position: sticky; top: 0 }
.page > main { min-width: 0 }
@media (min-width: 960px) { .page { grid-template-columns: 240px 1fr } }
@media (min-width: 960px) { .page > aside { display: block } }
.page > aside { display: none }
`
	},
	{
		id: 'typography',
		title: 'Typography and states',
		css: `.prose { line-height: 1.6; color: #333 }
.prose h1, .prose h2 { font-weight: 700 }
.prose a { color: #0066cc }
.prose a:hover, .prose a:focus-visible { text-decoration: underline }
.prose a::after { content: " ↗" }
.prose :is(ul, ol) > li + li { margin-top: 4px }
`
	},
	{
		id: 'at-rules',
		title: 'At-rules',
		css: `@charset "utf-8";
@font-face { font-family: "Inter"; src: url(inter.woff2) format("woff2") }
@supports (display: grid) { .grid { display: grid } }
@keyframes spin { to { transform: rotate(360deg) } }
.spinner { animation: spin 1s linear infinite }
`
	}
];

export const SASS_SAMPLE = `// Tokens and a button
$radius: 6px
$accent: #ff4400

@mixin focus-ring($color)
	outline: 2px solid rgba($color, 0.4)
	outline-offset: 2px

.btn
	padding: 8px 16px
	border-radius: $radius
	&:hover
		background: #f4f4f5
	&.primary
		background: $accent
		color: #fff
		&:focus-visible
			@include focus-ring($accent)
	> .icon
		width: 16px
		height: 16px
`;

/** Sass → CSS starting points (indented, plus one SCSS). */
export const SASS_SAMPLES: { id: string; title: string; css: string }[] = [
	{ id: 'sass-button', title: 'Variables and mixins', css: SASS_SAMPLE },
	{
		id: 'sass-loops',
		title: 'Loops and maps',
		css: `@use "sass:map"

$space: (sm: 8px, md: 12px, lg: 24px)

@each $name, $size in $space
	.pad-#{$name}
		padding: $size
	.gap-#{$name}
		gap: $size

@for $i from 1 through 3
	.col-#{$i}
		width: percentage(calc($i / 3))
`
	},
	{
		id: 'scss-card',
		title: 'SCSS: nesting and extend',
		css: `%card-base { padding: 24px; border: 1px solid #d8d8d8; }

.card {
  @extend %card-base;
  .title { font-weight: 600; }
  @media (min-width: 768px) {
    .title { font-size: 20px; }
  }
}
`
	}
];

export type Tab = 'convert' | 'diff';
export interface HistoryItem {
	at: number;
	css: string;
	/** Absent on items saved before Sass → CSS existed. */
	direction?: Direction;
}
const HISTORY_MAX = 12;

export const css_tool = persisted('tool.css-to-sass', {
	tab: 'convert' as Tab,
	direction: 'css-to-sass' as Direction,
	history: [] as HistoryItem[],
	css: SAMPLE,
	/** The Sass → CSS input. */
	sass: SASS_SAMPLE,
	syntax: 'auto' as Syntax,
	style: 'expanded' as OutputStyle,
	nest: true,
	nestMedia: true,
	comments: 'silent' as Comments,
	indent: 'tab' as Indent
});

export type Outcome = { ok: true; result: ConvertResult } | { ok: false; error: string; line: number | null };

export function convert(state: typeof css_tool = css_tool): Outcome {
	try {
		const result = css_to_sass(state.css, {
			nest: state.nest,
			nestMedia: state.nestMedia,
			comments: state.comments,
			indent: state.indent === 'tab' ? '\t' : ' '.repeat(Number(state.indent))
		});
		return { ok: true, result };
	} catch (err) {
		if (err instanceof CssParseError) return { ok: false, error: err.message, line: err.line };
		return { ok: false, error: String((err as Error).message ?? err), line: null };
	}
}

export type Compiled = { ok: true; css: string; syntax: 'indented' | 'scss' } | { ok: false; error: string; line: number | null };

/** Which syntax a Sass → CSS input is read as. */
export function detect_syntax(source: string, syntax: Syntax = 'auto'): 'indented' | 'scss' {
	if (syntax !== 'auto') return syntax;
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/#\{[^}]*\}/g, '');
	return /[{}]/.test(code) ? 'scss' : 'indented';
}

/** Sass → CSS through dart-sass. Errors carry dart-sass's message and 1-based line. */
export function compile_sass(state: typeof css_tool = css_tool): Compiled {
	const syntax = detect_syntax(state.sass, state.syntax);
	try {
		const css = compileString(state.sass, { syntax, style: state.style }).css;
		return { ok: true, css: css && !css.endsWith('\n') ? css + '\n' : css, syntax };
	} catch (err) {
		const e = err as { sassMessage?: string; message?: string; span?: { start: { line: number } } };
		return { ok: false, error: e.sassMessage ?? String(e.message ?? err).split('\n')[0], line: e.span ? e.span.start.line + 1 : null };
	}
}

/** The current direction's input. */
export const input_of = (state: typeof css_tool = css_tool) => (state.direction === 'css-to-sass' ? state.css : state.sass);
function set_input(value: string) {
	if (css_tool.direction === 'css-to-sass') css_tool.css = value;
	else css_tool.sass = value;
}
export const samples_of = (direction: Direction = css_tool.direction) => (direction === 'css-to-sass' ? SAMPLES : SASS_SAMPLES);
export const history_of = (direction: Direction = css_tool.direction) => css_tool.history.filter((h) => (h.direction ?? 'css-to-sass') === direction);

/** The current direction's output text, or the error that stops it. */
export function output(): { ok: true; text: string; kind: 'Sass' | 'CSS' } | { ok: false; error: string } {
	if (css_tool.direction === 'css-to-sass') {
		const o = convert();
		return o.ok ? { ok: true, text: o.result.sass, kind: 'Sass' } : { ok: false, error: o.error };
	}
	const c = compile_sass();
	return c.ok ? { ok: true, text: c.css, kind: 'CSS' } : { ok: false, error: c.error };
}

export function copy_output() {
	const out = output();
	if (!out.ok) return flash(`Nothing to copy: the ${css_tool.direction === 'css-to-sass' ? 'CSS' : 'Sass'} has an error`, 'danger');
	const lines = out.text.split('\n').length - 1;
	remember(input_of());
	if (copy_text(out.text)) flash(`Copied ${lines} line${lines === 1 ? '' : 's'} of ${out.kind}`, 'success');
	else flash('Could not reach the clipboard (pbcopy)', 'danger');
}

/** Keeps an input in its direction's history (newest first, de-duplicated) unless it is empty or a stock sample. */
export function remember(css: string, at = Date.now(), direction: Direction = css_tool.direction) {
	if (!css.trim() || samples_of(direction).some((s) => s.css === css)) return;
	const others = css_tool.history.filter((h) => !(h.css === css && (h.direction ?? 'css-to-sass') === direction));
	css_tool.history = [{ at, css, direction }, ...others].slice(0, HISTORY_MAX);
}

/** Replaces the current direction's input, keeping the old one in history. */
export function replace_input(css: string) {
	if (css === input_of()) return;
	remember(input_of());
	set_input(css);
}

export function load_sample(id = samples_of()[0].id) {
	const list = samples_of();
	replace_input((list.find((s) => s.id === id) ?? list[0]).css);
}
export const clear = () => replace_input('');

export function set_direction(direction: Direction) {
	css_tool.direction = direction;
	if (direction === 'sass-to-css') css_tool.tab = 'convert';
}

/** Moves the output into the other direction's input and flips to it. */
export function swap() {
	const out = output();
	if (!out.ok) return flash('Nothing to swap: fix the error first', 'danger');
	const to: Direction = css_tool.direction === 'css-to-sass' ? 'sass-to-css' : 'css-to-sass';
	remember(input_of());
	set_direction(to);
	if (to === 'sass-to-css' && css_tool.syntax === 'scss') css_tool.syntax = 'auto';
	replace_input(out.text);
}
/** Clears the current direction's recent inputs. */
export const clear_history = (direction: Direction = css_tool.direction) =>
	(css_tool.history = css_tool.history.filter((h) => (h.direction ?? 'css-to-sass') !== direction));

/** A one-line label for a stylesheet: its first selector or at-rule. */
export function headline(css: string): string {
	const code = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/#\{[^}]*\}/g, '#');
	const m = code.match(/[^{};\s][^{};]*(?=\{)/);
	// Indented Sass has no braces: its first line that is not a comment.
	const first = code.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'));
	return (m?.[0] ?? first ?? css).trim().replace(/\s+/g, ' ').slice(0, 48) || 'Empty';
}

export type RoundTrip = ({ ok: true } & Unified) | { ok: false; error: string };

/**
 * CSS → Sass only. The input (normalised by dart-sass) against the Sass output compiled back to
 * CSS. An empty patch means the conversion is exact.
 *
 * Sass → CSS has no Diff tab: its output *is* dart-sass's compile, so there is no
 * second opinion to compare it with (the tab is hidden in that direction).
 */
export function round_trip(state: typeof css_tool = css_tool): RoundTrip {
	const outcome = convert(state);
	if (!outcome.ok) return { ok: false, error: outcome.error };
	try {
		// Blank lines between rules are layout, not meaning: drop them on both sides.
		const tidy = (css: string) => css.replace(/\n\s*\n/g, '\n');
		const before = tidy(compileString(state.css, { syntax: 'css', style: 'expanded' }).css);
		const after = tidy(compileString(outcome.result.sass, { syntax: 'indented', style: 'expanded' }).css);
		return { ok: true, ...unified(before, after, { from: 'input.css', to: 'output.sass → css' }) };
	} catch (err) {
		return { ok: false, error: String((err as Error).message ?? err).split('\n')[0] };
	}
}
