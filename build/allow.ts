/**
 * Accepted losses: fractalstyler features that cannot reach GPUI on a class the app
 * uses, where the GPUI behaviour is an acceptable stand-in. Everything not listed
 * here fails `test/styles.ts`. Keep each entry narrow and say why.
 */

import type { Loss } from './gpui-css.ts';

export interface Allowance {
	/** The loss must involve this class. */
	class: string;
	/** Tested against `${detail} ${selector} ${reason}`. */
	match: RegExp;
	why: string;
}

export const ALLOWED: Allowance[] = [
	{
		class: 'input',
		match: /attribute selectors have no GPUI equivalent/,
		why: 'The sheet styles input variants via [data-variant] / [data-size]; GPUI has no attribute selectors, and the app sets none, so only the base .input rule applies.'
	},
	{
		class: 'input',
		match: /GPUI has no CSS transitions/,
		why: 'GPUI has no CSS transitions; the app animates through the `motion` prop.'
	},
	{
		class: 'input',
		match: /:focus-visible/,
		why: 'GPUI inputs show focus with their own caret; there is no :focus-visible to restyle.'
	},
	{
		class: 'input',
		match: /^display: block/,
		why: 'display: block is the GPUI default for a text field.'
	},
	{
		class: 'scroll-y',
		match: /overscroll-behavior/,
		why: 'GPUI scroll containers do not chain scrolling to their parent anyway.'
	},
	{
		class: 'scroll-x',
		match: /overscroll-behavior/,
		why: 'GPUI scroll containers do not chain scrolling to their parent anyway.'
	}
];

export const allowed = (loss: Loss, list: Allowance[] = ALLOWED) =>
	list.find((a) => loss.classes.includes(a.class) && a.match.test(`${loss.detail} ${loss.selector} ${loss.reason}`)) ?? null;
