/**
 * The React → Svelte tool's state: the TSX input, which output file is shown, and the
 * recent inputs. A module (not component) `$state`, persisted to disk, so the input
 * survives switching tools, hot reloads and restarts. Conversion is pure (`lib/`).
 */

import { react_to_svelte, ReactConvertError, type ConversionResult } from './lib/index.ts';
import { SAMPLES } from './samples.ts';
import { copy_text } from '../../../kernel/clipboard.ts';
import { persisted } from '../../../kernel/storage.svelte.ts';
import { flash } from '../../../kernel/status.svelte.ts';

export interface HistoryItem {
	at: number;
	source: string;
}
const HISTORY_MAX = 12;

export const r2s_tool = persisted('tool.react-to-svelte', {
	source: SAMPLES[0].source,
	/** The output file shown, by name; the main file when it no longer exists. */
	file: '',
	history: [] as HistoryItem[]
});

export type Outcome = { ok: true; result: ConversionResult } | { ok: false; error: string; line: number | null };

let memo: { source: string; outcome: Outcome } | null = null;

/** The conversion of the current input (cached per input: the UI asks several times a frame). */
export function convert(source: string = r2s_tool.source): Outcome {
	if (memo?.source === source) return memo.outcome;
	let outcome: Outcome;
	try {
		outcome = { ok: true, result: react_to_svelte(source) };
	} catch (err) {
		if (err instanceof ReactConvertError) outcome = { ok: false, error: err.message, line: err.line };
		else outcome = { ok: false, error: String((err as Error).message ?? err), line: null };
	}
	memo = { source, outcome };
	return outcome;
}

/** The output file being shown. */
export function current_file() {
	const o = convert();
	if (!o.ok) return null;
	return o.result.files.find((f) => f.name === r2s_tool.file) ?? o.result.files[0];
}

export function select_file(name: string) {
	r2s_tool.file = name;
}

export function copy_output() {
	const file = current_file();
	if (!file) return flash('Nothing to copy: the React input has an error', 'danger');
	remember(r2s_tool.source);
	const lines = file.code.split('\n').length - 1;
	if (copy_text(file.code)) flash(`Copied ${file.name} (${lines} line${lines === 1 ? '' : 's'})`, 'success');
	else flash('Could not reach the clipboard (pbcopy)', 'danger');
}

/** Keeps an input in history (newest first, de-duplicated) unless it is empty or a stock sample. */
export function remember(source: string, at = Date.now()) {
	if (!source.trim() || SAMPLES.some((s) => s.source === source)) return;
	r2s_tool.history = [{ at, source }, ...r2s_tool.history.filter((h) => h.source !== source)].slice(0, HISTORY_MAX);
}

/** Replaces the input, keeping the old one in history. */
export function replace_input(source: string) {
	if (source === r2s_tool.source) return;
	remember(r2s_tool.source);
	r2s_tool.source = source;
	r2s_tool.file = '';
}

export function load_sample(id = SAMPLES[0].id) {
	replace_input((SAMPLES.find((s) => s.id === id) ?? SAMPLES[0]).source);
}
export const clear = () => replace_input('');
export const clear_history = () => (r2s_tool.history = []);

/** A one-line label for a React input: its default export's name, else its first component's, else its first line. */
export function headline(source: string): string {
	const m = source.match(/export default (?:function\s+|memo\(|forwardRef\()?([A-Z][\w$]*)/) ?? source.match(/(?:function|const|let)\s+([A-Z][\w$]*)/);
	if (m) return m[1];
	const first = source.split('\n').find((l) => l.trim() && !l.trim().startsWith('import') && !l.trim().startsWith('//'));
	return (first ?? source).trim().replace(/\s+/g, ' ').slice(0, 48) || 'Empty';
}
