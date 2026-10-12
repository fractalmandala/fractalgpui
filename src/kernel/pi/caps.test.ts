import { describe, expect, test } from 'bun:test';
import { capText, capToolResult, MAX_RESULT_CHARS, stripBase64Runs } from './caps.ts';

describe('caps', () => {
	test('the result cap is 32k characters', () => expect(MAX_RESULT_CHARS).toBe(32_000));
	test('leaves small text alone', () => expect(capText('hi')).toEqual({ text: 'hi', truncated: false, omitted: 0 }));
	test('truncates at the limit with a note and prefers line boundaries', () => {
		const t = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
		const r = capText(t, 1000);
		expect(r.truncated).toBe(true);
		expect(r.text.length).toBeLessThan(1200);
		expect(r.text).toMatch(/\[truncated: \d+ more characters omitted/);
		expect(r.text.split('\n').slice(0, -1).every((l) => /^line \d+$/.test(l))).toBe(true);
	});
	test('never splits a surrogate pair', () => {
		const r = capText('a'.repeat(999) + '😀' + 'b'.repeat(100), 1000);
		expect(r.text.slice(0, 1000)).not.toMatch(/[\ud800-\udbff]$/);
	});
	test('a 3 MB result is cut to the cap plus a short note', () => {
		const { result, report } = capToolResult({ content: [{ type: 'text', text: 'x\n'.repeat(1_500_000) }] });
		const out = (result.content![0] as { text: string }).text;
		expect(out.length).toBeLessThan(MAX_RESULT_CHARS + 300);
		expect(report.truncated).toBe(true);
	});
	test('strips base64-looking runs', () => {
		const r = stripBase64Runs('x ' + 'QUJD'.repeat(1000) + ' y');
		expect(r.text.length).toBeLessThan(100);
		expect(r.stripped).toBe(4000);
	});
	test('drops image blocks and oversized details', () => {
		const { result, report } = capToolResult({
			content: [{ type: 'text', text: 'ok' }, { type: 'image', data: 'AAAA'.repeat(100000), mimeType: 'image/png' } as never],
			details: { big: 'x'.repeat(20000) }
		});
		expect(JSON.stringify(result).length).toBeLessThan(1000);
		expect(report).toMatchObject({ imagesDropped: 1, detailsDropped: true });
	});
});
