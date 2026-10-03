/**
 * The design tokens in force, as flattened by `build/tokens.ts` from fractalstyler
 * (plus the app's own `:root` additions), and a summary of the last style build.
 * `build/styles.ts` writes both on every style (re)load; the shell hands the active
 * mode's map to `set_css_vars`.
 */

export type Mode = 'light' | 'dark';
export type TokenMap = Record<string, string>;

export interface StyleReport {
	/** How fractalstyler was compiled: its index, its partials, or partial by partial. */
	mode: 'index' | 'partials' | 'per-partial';
	registered: number;
	losses: number;
	warnings: string[];
}

class Design {
	tokens = $state.raw<{ light: TokenMap; dark: TokenMap }>({ light: {}, dark: {} });
	report = $state.raw<StyleReport | null>(null);
}

export const design = new Design();
