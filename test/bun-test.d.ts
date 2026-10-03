// Just enough of `bun:test` for tsc. The app deliberately has no @types/bun (app
// code sticks to node: APIs, so it stays runnable under Node too); only the
// UI-free `*.test.ts` files under src/surfaces/*/lib import bun:test.
declare module 'bun:test' {
	export function describe(name: string, fn: () => void): void;
	export function test(name: string, fn: () => void | Promise<void>): void;
	export const it: typeof test;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matcher surface is wide; tests are checked by running them
	export function expect(actual: unknown): any;
}
