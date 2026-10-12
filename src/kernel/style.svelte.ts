/**
 * The live style editor's state and what it does to the token map. Every choice
 * only re-points existing app tokens at the values of other existing tokens
 * (no new tokens, no invented values); `App.svelte` hands the result to
 * `set_css_vars`, which repaints every live `var()` user without a rebuild.
 *
 * Named steps shift a token scale by one step:
 * - Text: small / regular / large shifts `--text-*` down / not / up one step.
 * - Density: tight / compact / spacious shifts `--space-*` and the control heights
 *   (`--height-16` … `--height-40`) down / not / up one step.
 * - Corners: sharp / soft / round shifts `--radius-2` … `--radius-32`.
 * The ends of a scale stay put (nothing exists below `--space-4`).
 *
 * Buttons and radii read app role tokens (`--btn-*`, `--radius-*`, defined in
 * `_own.sass`). Each control picks which existing token a role reads; `auto`
 * keeps the default source.
 *
 * Precedence: an explicit button height / padding overrides Density for buttons, and
 * an explicit radius overrides Corners for that role; both take the token's own
 * (unshifted) value. On `auto` the role follows its default token *after* the
 * Density / Corners shift. Button colours read the chosen token after the colour-role
 * and accent choices, so "Accent" follows the Accent control.
 *
 * Colour roles choose between the app's palette (`_own.sass`, today's look) and
 * fractalstyler's own value for the same role tokens; the accent between the app's
 * green, fractalstyler's orangepop, and fractalstyler's per-mode theme colour.
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
	bg: { token: 'btn-bg', source: 'bg-raised', choices: [{ value: 'bg-button', label: 'Button' }, { value: 'bg-sunken', label: 'Sunken' }, { value: 'bg-surface', label: 'Surface' }] },
	fg: { token: 'btn-fg', source: 'text-primary', choices: [{ value: 'text-secondary', label: 'Secondary' }, { value: 'accent', label: 'Accent' }] },
	hover: { token: 'btn-hover-bg', source: 'state-hover', choices: [{ value: 'state-selected', label: 'Selected' }, { value: 'bg-sunken', label: 'Sunken' }] },
	primaryBg: { token: 'btn-primary-bg', source: 'accent', choices: [{ value: 'accent-hover', label: 'Deep' }, { value: 'text-primary', label: 'Ink' }] },
	primaryFg: { token: 'btn-primary-fg', source: 'on-accent', choices: [{ value: 'text-primary', label: 'Ink' }] },
	primaryHover: { token: 'btn-primary-hover-bg', source: 'accent-hover', choices: [{ value: 'accent', label: 'Accent' }, { value: 'accent-soft', label: 'Soft' }] }
};
/** Size slots: role token, default source (shifted by Density / Corners on auto), and choices. */
export const SIZE_SLOTS = {
	height: { token: 'btn-height', source: 'height-28', choices: ['height-20', 'height-24', 'height-28', 'height-32'] },
	padX: { token: 'btn-pad-x', source: 'space-8', choices: ['space-4', 'space-8', 'space-12', 'space-16', 'space-24'] }
} as const;
export const RADIUS_ROLES: Record<RadiusRole, { token: string; source: string }> = {
	control: { token: 'radius-control', source: 'radius-4' },
	card: { token: 'radius-card', source: 'radius-4' },
	pill: { token: 'radius-pill', source: 'radius-full' }
};
export const RADIUS_CHOICES = ['radius-2', 'radius-4', 'radius-8', 'radius-16', 'radius-32', 'radius-full'];

export const DEFAULTS = {
	text: 'regular' as TextStep,
	density: 'compact' as Density,
	corners: 'soft' as Corners,
	accent: 'greenpop' as Accent,
	roles: { surface: 'app', text: 'app', border: 'app', hover: 'app', selected: 'app' } as Record<Role, Palette>,
	buttons: { bg: AUTO, fg: AUTO, hover: AUTO, primaryBg: AUTO, primaryFg: AUTO, primaryHover: AUTO } as Record<ButtonSlot, string>,
	sizes: { height: AUTO, padX: AUTO } as Record<keyof typeof SIZE_SLOTS, string>,
	radii: { control: AUTO, card: AUTO, pill: AUTO } as Record<RadiusRole, string>,
	/** Exact colour overrides per token (the colour picker): beat every other choice. */
	custom: {} as Record<string, string>
};

const fresh = () => ({ ...DEFAULTS, roles: { ...DEFAULTS.roles }, buttons: { ...DEFAULTS.buttons }, sizes: { ...DEFAULTS.sizes }, radii: { ...DEFAULTS.radii }, custom: { ...DEFAULTS.custom } });

/** Normalises a hex colour (`ff0000` → `#ff0000`); null when it is not 3–8 hex digits. */
export function clean_hex(raw: string): string | null {
	const hex = raw.trim().replace(/^#/, '').toLowerCase();
	return /^[0-9a-f]{3,8}$/.test(hex) ? `#${hex}` : null;
}
export const style = persisted('style', fresh());

export const SCALES = {
	text: ['text-xs', 'text-sm', 'text-md', 'text-bs', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'],
	space: ['space-4', 'space-8', 'space-12', 'space-16', 'space-24', 'space-32', 'space-48', 'space-64'],
	radius: ['radius-2', 'radius-4', 'radius-8', 'radius-16', 'radius-32']
};
/** Control heights, shortest first. Layout heights (48, 64) never shift. */
const HEIGHT_LADDER: string[][] = [['height-16'], ['height-20'], ['height-24'], ['height-28'], ['height-32'], ['height-40']];

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
	// Exact colours last: they beat scales, roles, accents and slots.
	for (const [name, raw] of Object.entries(s.custom ?? {})) {
		const hex = clean_hex(raw);
		if (hex) out[name] = hex;
	}
	return out;
}

/** Overrides one token with an exact colour (null clears it back to automatic). */
export function set_custom(token: string, raw: string | null) {
	if (raw === null) {
		const { [token]: _dropped, ...rest } = style.custom;
		style.custom = rest;
		return;
	}
	const hex = clean_hex(raw);
	if (hex) style.custom = { ...style.custom, [token]: hex };
}

export const is_default = (s: typeof style = style) => JSON.stringify(s) === JSON.stringify(fresh());

export function reset_style() {
	Object.assign(style, fresh());
}

