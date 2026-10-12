/**
 * The test runner: each headless test is its own process (GPUI's test renderer is a
 * per-process singleton and `finish()` exits),
 * plus `bun test` over the UI-free tool logic in `src/surfaces/<tool>/lib`.
 * Tests get a throwaway settings dir and an in-memory clipboard.
 *
 *   bun run test        (= gpuix-svelte --bun test.ts)
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const cli = join(root, 'node_modules/gpuix-svelte/bin/gpuix-svelte.js');

// src/surfaces/<surface>/test.ts and src/surfaces/tools/<tool>/test.ts
const tests_in = (dir: string) => readdirSync(join(root, dir)).map((t) => join(root, dir, t, 'test.ts')).filter((f) => existsSync(f));
const tool_tests = [...tests_in('src/surfaces'), ...tests_in('src/surfaces/tools')];
const files = [join(root, 'test/styles.ts'), join(root, 'test/ui.ts'), join(root, 'test/dock.ts'), join(root, 'test/shell.ts'), join(root, 'test/models-scale.ts'), ...tool_tests];

const runs: { name: string; cmd: string; args: string[]; cwd: string }[] = [
	...files.map((f) => ({ name: relative(root, f), cmd: process.execPath, args: [cli, '--bun', f], cwd: root })),
	// Pure tool logic (src/surfaces/<tool>/lib/*.test.ts): plain `bun test`, no renderer.
	{ name: 'src/**/*.test.ts (bun test)', cmd: process.execPath, args: ['test', './src'], cwd: root }
];

let failed = 0;
for (const run of runs) {
	console.log(`\n── ${run.name}`);
	const env = { ...process.env, FRACTALGPUI_DATA_DIR: mkdtempSync(join(tmpdir(), 'fractalgpui-test-')), FRACTALGPUI_CLIPBOARD: 'memory' };
	const r = spawnSync(run.cmd, run.args, { cwd: run.cwd, env, stdio: 'inherit' });
	if (r.status !== 0) {
		failed++;
		console.log(`✗ ${run.name} (exit ${r.status ?? r.signal})`);
	}
}

console.log(failed ? `\n${failed} of ${runs.length} test files failed` : `\nall ${runs.length} test files passed`);
process.exit(failed ? 1 : 0);
