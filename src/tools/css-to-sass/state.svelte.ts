/**
 * The converter's state. A module (not component) `$state`, persisted to disk, so
 * the input survives switching tools, hot reloads and restarts.
 */

import { css_to_sass, CssParseError, type ConvertResult } from './lib/index.ts';
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

export const css_tool = persisted('tool.css-to-sass', {
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
	if (copy_text(outcome.result.sass)) flash(`Copied ${lines} line${lines === 1 ? '' : 's'} of Sass`, 'success');
	else flash('Could not reach the clipboard (pbcopy)', 'danger');
}

const COMMENTS: Comments[] = ['silent', 'loud', 'drop'];
const INDENTS: Indent[] = ['tab', '2', '4'];

export const cycle_comments = () => (css_tool.comments = COMMENTS[(COMMENTS.indexOf(css_tool.comments) + 1) % COMMENTS.length]);
export const cycle_indent = () => (css_tool.indent = INDENTS[(INDENTS.indexOf(css_tool.indent) + 1) % INDENTS.length]);
export const load_sample = () => (css_tool.css = SAMPLE);
export const clear = () => (css_tool.css = '');
