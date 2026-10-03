/**
 * Imported FIRST by every headless test: keeps tests off Amrit's real settings file
 * and clipboard. (`test.ts` sets these too; this covers running one file directly.)
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.FRACTALGPUI_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'fractalgpui-test-'));
process.env.FRACTALGPUI_CLIPBOARD ??= 'memory';
