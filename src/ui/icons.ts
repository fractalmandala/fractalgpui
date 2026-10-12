/**
 * The icon set: Lucide SVGs copied into assets/icons/ (see its LICENSE), plus the
 * app's own marks. To add one, copy `<name>.svg` there and add the name here;
 * GPUI tints `<svg src>` with `color`, so icons must paint with `currentColor`
 * (hardcoded colours, e.g. black, render as-is and vanish in dark mode).
 */

import { fileURLToPath } from 'node:url';

export const ICONS = [
	'house',
	'braces',
	'panel-left',
	'panel-right',
	'bot',
	'sliders-horizontal',
	'settings',
	'search',
	'command',
	'sun',
	'moon',
	'copy',
	'check',
	'x',
	'chevron-right',
	'chevron-down',
	'plus',
	'send',
	'sparkles',
	'trash-2',
	'clipboard-paste',
	'wand-sparkles',
	'palette',
	'layers',
	'file-text',
	'info',
	'arrow-right-left',
	'refresh-cw',
	'message-square',
	'paperclip',
	'code',
	'list-tree',
	'history',
	'panel-left-close',
	'panel-right-close',
	'panel-agent-open',
	'panel-agent-close',
	'css-sass',
	'svelte-react',
	'at-sign',
	'mic',
	'folder',
	'folder-open',
	'pin',
	'archive',
	'pencil',
	'git-branch',
	'git-fork',
	'lock',
	'shield-check',
	'shield-off',
	'list-checks',
	'compass',
	'gauge',
	'brain',
	'eye',
	'chevron-up',
	'more-horizontal',
	'arrow-up',
	'settings-2',
	'plug',
	'key'
] as const;

export type IconName = (typeof ICONS)[number];

const DIR = fileURLToPath(new URL('../../assets/icons/', import.meta.url));

export const icon_path = (name: IconName) => `${DIR}${name}.svg`;
