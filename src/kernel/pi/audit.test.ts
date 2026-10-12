import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLog } from './audit.ts';

const dir = mkdtempSync(join(tmpdir(), 'fractalgpui-audit-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('AuditLog', () => {
	test('appends one JSON row per line and reads them back in order', () => {
		const log = new AuditLog(join(dir, 'a.jsonl'));
		log.append({ phase: 'before', tool: 'bash', callId: 'c1', summary: 'ls' });
		log.append({ phase: 'after', tool: 'bash', callId: 'c1', summary: 'ok', ok: true });
		const rows = log.read();
		expect(rows.map((r) => r.phase)).toEqual(['before', 'after']);
		expect(readFileSync(log.file, 'utf8').trim().split('\n')).toHaveLength(2);
		expect(rows[0]!.ts).toBeGreaterThan(0);
	});
	test('caps summary and note', () => {
		const log = new AuditLog(join(dir, 'b.jsonl'));
		log.append({ phase: 'before', tool: 'write', callId: 'c', summary: 'x'.repeat(5000), note: 'n'.repeat(5000) });
		const [r] = log.read();
		expect(r!.summary.length).toBeLessThan(700);
		expect(r!.note!.length).toBeLessThan(400);
	});
	test('rotates past the size limit, keeping one generation', () => {
		const file = join(dir, 'c.jsonl');
		const log = new AuditLog(file, 500);
		for (let i = 0; i < 30; i++) log.append({ phase: 'before', tool: 't', callId: String(i), summary: 'row ' + i });
		expect(existsSync(file + '.1')).toBe(true);
		expect(existsSync(file + '.2')).toBe(false);
		expect(log.read().length).toBeLessThan(30);
	});
	test('a write failure throws (so the guarded call is blocked)', () => {
		const log = new AuditLog(join(dir, 'missing-dir', 'x.jsonl'));
		expect(() => log.append({ phase: 'before', tool: 't', callId: '1', summary: 's' })).toThrow();
	});
	test('an existing log is appended to, not overwritten', () => {
		const file = join(dir, 'd.jsonl');
		writeFileSync(file, JSON.stringify({ ts: 1, phase: 'before', tool: 'old', callId: '0', summary: '' }) + '\n');
		new AuditLog(file).append({ phase: 'after', tool: 'new', callId: '1', summary: '' });
		expect(new AuditLog(file).read().map((r) => r.tool)).toEqual(['old', 'new']);
	});
});
