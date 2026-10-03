/**
 * The converter's state. A module (not component) `$state`, persisted to disk, so
 * the input survives switching tools, hot reloads and restarts.
 */

import { compileString } from 'sass';
import { css_to_sass, CssParseError, type ConvertResult } from './lib/index.ts';
import { unified, type Unified } from './lib/diff.ts';
import { copy_text } from '../../kernel/clipboard.ts';
import { persisted } from '../../kernel/storage.svelte.ts';
import { flash } from '../../kernel/status.svelte.ts';

export type Comments = 'silent' | 'loud' | 'drop';
export type Indent = 'tab' | '2' | '4';

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

export type Tab = 'convert' | 'diff';
export interface HistoryItem {
	at: number;
	css: string;
}
const HISTORY_MAX = 12;

export const css_tool = persisted('tool.css-to-sass', {
	tab: 'convert' as Tab,
	history: [] as HistoryItem[],
	css: SAMPLE,
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

export function copy_output() {
	const outcome = convert();
	if (!outcome.ok) return flash('Nothing to copy: the CSS has an error', 'danger');
	const lines = outcome.result.sass.split('\n').length - 1;
	remember(css_tool.css);
	if (copy_text(outcome.result.sass)) flash(`Copied ${lines} line${lines === 1 ? '' : 's'} of Sass`, 'success');
	else flash('Could not reach the clipboard (pbcopy)', 'danger');
}

/** Keeps `css` in history (newest first, de-duplicated) unless it is empty or a stock sample. */
export function remember(css: string, at = Date.now()) {
	if (!css.trim() || SAMPLES.some((s) => s.css === css)) return;
	css_tool.history = [{ at, css }, ...css_tool.history.filter((h) => h.css !== css)].slice(0, HISTORY_MAX);
}

/** Replaces the input, keeping the old one in history. */
export function replace_input(css: string) {
	if (css === css_tool.css) return;
	remember(css_tool.css);
	css_tool.css = css;
}

export const load_sample = (id = SAMPLES[0].id) => replace_input(SAMPLES.find((s) => s.id === id)?.css ?? SAMPLE);
export const clear = () => replace_input('');
export const clear_history = () => (css_tool.history = []);

/** A one-line label for a stylesheet: its first selector or at-rule. */
export function headline(css: string): string {
	const m = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{};\s][^{};]*(?=\{)/);
	return (m?.[0] ?? css).trim().replace(/\s+/g, ' ').slice(0, 48) || 'Empty';
}

export type RoundTrip = ({ ok: true } & Unified) | { ok: false; error: string };

/**
 * The input (normalised by dart-sass) against the Sass output compiled back to
 * CSS. An empty patch means the conversion is exact.
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
