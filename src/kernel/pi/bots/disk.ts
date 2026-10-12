// Per-bot disk usage (ported from pibots disk.ts), measured like `df`: ALLOCATED blocks (blocks * 512), not apparent size.
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import type { BotPaths } from './paths.ts';

export const BUDGETS_BYTES = { audit: 8 << 20, memory: 20 << 20, media: 200 << 20, browserProfile: 500 << 20 } as const;
export type DiskPart = keyof typeof BUDGETS_BYTES;
export interface DiskUsage extends Record<DiskPart, number> { total: number; overBudget: DiskPart[] }

export function allocatedBytes(path: string): number {
	if (!existsSync(path)) return 0;
	let total = 0;
	const walk = (p: string) => {
		let st;
		try {
			st = lstatSync(p);
		} catch {
			return;
		}
		total += st.blocks * 512;
		if (st.isDirectory()) {
			let names: string[] = [];
			try {
				names = readdirSync(p);
			} catch {
				return;
			}
			for (const n of names) walk(`${p}/${n}`);
		}
	};
	walk(path);
	return total;
}

/** Sizes of a bot's home parts (the memory sqlite includes its -wal/-shm siblings). */
export function measureDisk(p: BotPaths): DiskUsage {
	const sizes: Record<DiskPart, number> = {
		audit: allocatedBytes(p.audit),
		memory: allocatedBytes(p.memory) + allocatedBytes(`${p.memory}-wal`) + allocatedBytes(`${p.memory}-shm`),
		media: allocatedBytes(p.media),
		browserProfile: allocatedBytes(p.browserProfile)
	};
	const overBudget = (Object.keys(BUDGETS_BYTES) as DiskPart[]).filter((k) => sizes[k] > BUDGETS_BYTES[k]);
	return { ...sizes, total: Object.values(sizes).reduce((a, b) => a + b, 0), overBudget };
}
