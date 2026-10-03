import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where fractalgpui keeps its data. `FRACTALGPUI_DATA_DIR` overrides it (the tests
 * point it at a temp dir so they never touch the real settings).
 */
export function data_dir(): string {
	const override = process.env.FRACTALGPUI_DATA_DIR;
	if (override) return override;
	switch (process.platform) {
		case 'darwin':
			return join(homedir(), 'Library', 'Application Support', 'fractalgpui');
		case 'win32':
			return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'fractalgpui');
		default:
			return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'fractalgpui');
	}
}
