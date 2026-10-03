/**
 * The live style editor's state and what it does to the token map. Every choice
 * only re-points existing fractalstyler tokens at the values of other existing
 * tokens (no new tokens, no invented values); `App.svelte` hands the result to
 * `set_css_vars`, which repaints every live `var()` user without a rebuild.
 *
 * Named steps (assets/token-audit.md) shift a token scale by one step:
 * - Text: small / regular / large shifts `--text-*` down / not / up one step.
 * - Density: tight / compact / spacious shifts `--space-*` and the control heights
 *   (`--height-md` … `--control-h-lg`) down / not / up one step.
 * - Corners: sharp / soft / round shifts `--radius-xs` … `--radius-lg`.
 * The ends of a scale stay put (nothing exists below `--space-xs`).
 *
 * Colour roles choose between the app's palette (`_own.sass`, today's look) and
 * fractalstyler's own value for the same role tokens; the accent between the app's
 * greenpop, fractalstyler's orangepop, and fractalstyler's per-mode theme colour.
 */

import { design, type Mode, type TokenMap } from './design.svelte.ts';
import { persisted } from './storage.svelte.ts';

export type TextStep = 'small' | 'regular' | 'large';
export type Density = 'tight' | 'compact' | 'spacious';
export type Corners = 'sharp' | 'soft' | 'round';
export type Palette = 'app' | 'fractalstyler';
export type Accent = 'greenpop' | 'orangepop' | 'fractalstyler';
export type Role = 'surface' | 'text' | 'border' | 'hover' | 'selected';

export const DEFAULTS = {
	text: 'regular' as TextStep,
	density: 'compact' as Density,
	corners: 'soft' as Corners,
	accent: 'greenpop' as Accent,
	roles: { surface: 'app', text: 'app', border: 'app', hover: 'app', selected: 'app' } as Record<Role, Palette>
};

export const style = persisted('style', { ...DEFAULTS, roles: { ...DEFAULTS.roles } });

export const SCALES = {
	text: ['text-xs', 'text-sm', 'text-md', 'text-bs', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'],
	space: ['space-xs', 'space-sm', 'space-md', 'space-bs', 'space-lg', 'space-xl', 'space-2xl', 'space-3xl'],
	radius: ['radius-xs', 'radius-sm', 'radius-md', 'radius-bs', 'radius-lg']
};
/** Control heights, shortest first; tokens with the same value share a rung. */
const HEIGHT_LADDER: string[][] = [['height-md'], ['height-bs'], ['height-lg', 'control-h-bs'], ['control-h-lg']];

/** The tokens each colour role covers (all exist in fractalstyler and the app palette). */
export const ROLE_TOKENS: Record<Role, string[]> = {
	surface: ['bg', 'bg-surface', 'bg-panel', 'bg-raised', 'bg-sunken', 'bg-extra', 'bg-input', 'bg-button'],
	text: ['text-primary', 'text-secondary', 'text-muted'],
	border: ['border', 'border-subtle', 'border-strong'],
	hover: ['state-hover'],
	selected: ['state-selected']
};

const ACCENTS: Record<Accent, (base: TokenMap, now: TokenMap) => [string, string, string]> = {
	greenpop: (_b, now) => [now.greenpop1, now.greenpop2, now.greenpop3],
	orangepop: (_b, now) => [now.orangepop1, now.orangepop5, now.orangepop6],
	fractalstyler: (base) => [base['theme-color'], base['theme-color-alt'], base['theme-color-alt']]
};

const shift = (out: TokenMap, from: TokenMap, scale: string[], by: number) => {
	if (!by) return;
	scale.forEach((name, i) => {
		const j = Math.max(0, Math.min(scale.length - 1, i + by));
		if (from[scale[j]] !== undefined) out[name] = from[scale[j]];
	});
};
const shift_ladder = (out: TokenMap, from: TokenMap, by: number) => {
	if (!by) return;
	HEIGHT_LADDER.forEach((rung, i) => {
		const src = HEIGHT_LADDER[Math.max(0, Math.min(HEIGHT_LADDER.length - 1, i + by))][0];
		for (const name of rung) if (from[src] !== undefined) out[name] = from[src];
	});
};

const STEP = { small: -1, regular: 0, large: 1, tight: -1, compact: 0, spacious: 1, sharp: -1, soft: 0, round: 1 } as const;

/** The token map for `mode` with the editor's choices applied. */
export function styled_tokens(mode: Mode, s: typeof style = style, tokens = design.tokens[mode], base = design.base[mode]): TokenMap {
	const out: TokenMap = { ...tokens };
	shift(out, tokens, SCALES.text, STEP[s.text]);
	shift(out, tokens, SCALES.space, STEP[s.density]);
	shift_ladder(out, tokens, STEP[s.density]);
	shift(out, tokens, SCALES.radius, STEP[s.corners]);
	for (const role of Object.keys(ROLE_TOKENS) as Role[]) {
		if (s.roles[role] !== 'fractalstyler') continue;
		for (const name of ROLE_TOKENS[role]) if (base[name] !== undefined) out[name] = base[name];
	}
	if (s.accent !== 'greenpop') {
		const [accent, hover, soft] = ACCENTS[s.accent](base, tokens);
		if (accent) Object.assign(out, { accent, 'accent-hover': hover, 'accent-soft': soft, 'theme-color': accent, 'theme-color-alt': hover });
	}
	return out;
}

export const is_default = (s: typeof style = style) =>
	s.text === DEFAULTS.text && s.density === DEFAULTS.density && s.corners === DEFAULTS.corners && s.accent === DEFAULTS.accent &&
	(Object.keys(DEFAULTS.roles) as Role[]).every((r) => s.roles[r] === DEFAULTS.roles[r]);

export function reset_style() {
	Object.assign(style, { ...DEFAULTS, roles: { ...DEFAULTS.roles } });
}

/** The tokens the editor changed from the app's defaults, as Sass variables. */
export function as_sass(mode: Mode): string {
	const now = styled_tokens(mode);
	const before = design.tokens[mode];
	const changed = Object.keys(now).filter((k) => now[k] !== before[k]).sort();
	const head = `// fractalgpui style: text ${style.text}, density ${style.density}, corners ${style.corners}, accent ${style.accent} (${mode})\n`;
	return head + (changed.length ? changed.map((k) => `$${k}: ${now[k]}`).join('\n') : '// (no changes from the defaults)') + '\n';
}
