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
 * Buttons and radii read app role tokens (`--wb-btn-*`, `--wb-radius-*`, defined in
 * `_own.sass` as the fractalstyler token they used before). Each control picks which
 * existing token a role reads; `auto` keeps the default source.
 *
 * Precedence: an explicit button height / padding overrides Density for buttons, and
 * an explicit radius overrides Corners for that role; both take the token's own
 * (unshifted) value. On `auto` the role follows its default token *after* the
 * Density / Corners shift. Button colours read the chosen token after the colour-role
 * and accent choices, so "Accent" follows the Accent control.
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

export type ButtonSlot = 'bg' | 'fg' | 'hover' | 'primaryBg' | 'primaryFg' | 'primaryHover';
export type RadiusRole = 'control' | 'card' | 'pill';
export const AUTO = 'auto';

/** Each button slot: its role token, its default source ('Auto'), and the other tokens it may read. */
export const BUTTON_SLOTS: Record<ButtonSlot, { token: string; source: string; choices: { value: string; label: string }[] }> = {
	bg: { token: 'wb-btn-bg', source: 'bg-raised', choices: [{ value: 'bg-button', label: 'Button' }, { value: 'bg-sunken', label: 'Sunken' }, { value: 'bg-surface', label: 'Surface' }] },
	fg: { token: 'wb-btn-fg', source: 'text-primary', choices: [{ value: 'text-secondary', label: 'Secondary' }, { value: 'accent', label: 'Accent' }] },
	hover: { token: 'wb-btn-hover-bg', source: 'state-hover', choices: [{ value: 'state-selected', label: 'Selected' }, { value: 'bg-sunken', label: 'Sunken' }] },
	primaryBg: { token: 'wb-btn-primary-bg', source: 'accent', choices: [{ value: 'greenpop4', label: 'Green 4' }, { value: 'orangepop1', label: 'Orange' }, { value: 'black-fixed', label: 'Ink' }] },
	primaryFg: { token: 'wb-btn-primary-fg', source: 'on-accent', choices: [{ value: 'white-fixed', label: 'White' }, { value: 'black-fixed', label: 'Ink' }] },
	primaryHover: { token: 'wb-btn-primary-hover-bg', source: 'accent-hover', choices: [{ value: 'greenpop3', label: 'Green 3' }, { value: 'orangepop5', label: 'Orange 5' }] }
};
/** Size slots: role token, default source (shifted by Density / Corners on auto), and choices. */
export const SIZE_SLOTS = {
	height: { token: 'wb-btn-height', source: 'control-h-bs', choices: ['height-md', 'height-bs', 'control-h-bs', 'control-h-lg'] },
	padX: { token: 'wb-btn-pad-x', source: 'space-md', choices: ['space-xs', 'space-sm', 'space-md', 'space-bs', 'space-lg'] }
} as const;
export const RADIUS_ROLES: Record<RadiusRole, { token: string; source: string }> = {
	control: { token: 'wb-radius-control', source: 'radius-md' },
	card: { token: 'wb-radius-card', source: 'radius-md' },
	pill: { token: 'wb-radius-pill', source: 'radius-full' }
};
export const RADIUS_CHOICES = ['radius-xs', 'radius-sm', 'radius-md', 'radius-bs', 'radius-lg', 'radius-full'];

export const DEFAULTS = {
	text: 'regular' as TextStep,
	density: 'compact' as Density,
	corners: 'soft' as Corners,
	accent: 'greenpop' as Accent,
	roles: { surface: 'app', text: 'app', border: 'app', hover: 'app', selected: 'app' } as Record<Role, Palette>,
	buttons: { bg: AUTO, fg: AUTO, hover: AUTO, primaryBg: AUTO, primaryFg: AUTO, primaryHover: AUTO } as Record<ButtonSlot, string>,
	sizes: { height: AUTO, padX: AUTO } as Record<keyof typeof SIZE_SLOTS, string>,
	radii: { control: AUTO, card: AUTO, pill: AUTO } as Record<RadiusRole, string>
};

const fresh = () => ({ ...DEFAULTS, roles: { ...DEFAULTS.roles }, buttons: { ...DEFAULTS.buttons }, sizes: { ...DEFAULTS.sizes }, radii: { ...DEFAULTS.radii } });
export const style = persisted('style', fresh());

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
	// Role tokens last, so they see every choice above (see the precedence note).
	const pick = (name: string, from: TokenMap) => from[name] ?? out[name];
	for (const slot of Object.keys(BUTTON_SLOTS) as ButtonSlot[]) {
		const { token, source } = BUTTON_SLOTS[slot];
		const chosen = s.buttons?.[slot] ?? AUTO;
		out[token] = out[chosen === AUTO ? source : chosen] ?? out[token];
	}
	for (const key of Object.keys(SIZE_SLOTS) as (keyof typeof SIZE_SLOTS)[]) {
		const { token, source } = SIZE_SLOTS[key];
		const chosen = s.sizes?.[key] ?? AUTO;
		out[token] = chosen === AUTO ? out[source] : pick(chosen, tokens);
	}
	for (const role of Object.keys(RADIUS_ROLES) as RadiusRole[]) {
		const { token, source } = RADIUS_ROLES[role];
		const chosen = s.radii?.[role] ?? AUTO;
		out[token] = chosen === AUTO ? out[source] : pick(chosen, tokens);
	}
	return out;
}

export const is_default = (s: typeof style = style) => JSON.stringify(s) === JSON.stringify(fresh());

export function reset_style() {
	Object.assign(style, fresh());
}

/** The tokens the editor changed from the app's defaults, as Sass variables. */
export function as_sass(mode: Mode): string {
	const now = styled_tokens(mode);
	const before = design.tokens[mode];
	const changed = Object.keys(now).filter((k) => now[k] !== before[k]).sort();
	const head = `// fractalgpui style: text ${style.text}, density ${style.density}, corners ${style.corners}, accent ${style.accent} (${mode})\n`;
	return head + (changed.length ? changed.map((k) => `$${k}: ${now[k]}`).join('\n') : '// (no changes from the defaults)') + '\n';
}
