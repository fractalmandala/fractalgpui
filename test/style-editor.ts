// The live style editor: in sidebar-right on every surface; each named step changes
// rendered sizes at once (set_css_vars, no rebuild), persists, and resets.
import './harness.ts';
import { readFileSync } from 'node:fs';
import { all_text, bounds, check, click_test_id, find_test_id, finish, mount_headless, press } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { last_copied } from '../src/kernel/clipboard.ts';
import { design } from '../src/kernel/design.svelte.ts';
import { settings, switch_to } from '../src/kernel/settings.svelte.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';
import { style, styled_tokens } from '../src/kernel/style.svelte.ts';

load_styles();
settings.theme = 'light';
switch_to('tools');
mount_headless(App, { width: 1400, height: 760 });

const box = (id: string) => bounds(find_test_id(id)!) ?? [0, 0, -1, -1];
const h = (id: string) => box(id)[3];
const w = (id: string) => box(id)[2];

check('editor is not shown while sidebar-right is collapsed', !find_test_id('style-editor'));
press('cmd-i');
check('⌘I opens sidebar-right with the style editor', !!find_test_id('style-editor') && all_text().includes('Text size'));
check('defaults are today\'s look', [style.text, style.density, style.corners, style.accent], ['regular', 'compact', 'soft', 'greenpop']);
const base = { btn: h('sample'), btnW: w('sample'), header: h('section-main-header') ?? 0, seg: h('opt-indent-tab') };
// Measured boxes sit 2px inside the token heights (the 1px border), so compare steps by delta:
// buttons --control-h-bs 32 → 24 / 38, segment items --height-bs 24 → 20 / 32.
check('baseline: the segment item is 8px shorter than the button (24 vs 32)', base.btn - base.seg, 8);

// Density
click_test_id('style-density-tight');
check('tight: buttons and segment items shrink one step', [h('sample') - base.btn, h('opt-indent-tab') - base.seg, w('sample') < base.btnW], [-8, -4, true]);
click_test_id('style-density-spacious');
check('spacious: they grow one step', [h('sample') - base.btn, h('opt-indent-tab') - base.seg, w('sample') > base.btnW], [6, 8, true]);
click_test_id('style-density-compact');
check('compact restores them', [h('sample'), w('sample')], [base.btn, base.btnW]);

// Text
click_test_id('style-text-large');
check('large text widens a button label', w('sample') > base.btnW);
check('large text shifts the scale one step', styled_tokens('light')['text-sm'], design.tokens.light['text-md']);
click_test_id('style-text-small');
check('small text narrows it', w('sample') < base.btnW);
click_test_id('style-text-regular');
check('regular restores it', w('sample'), base.btnW);

// The editor body scrolls; controls below the 538px headless viewport are driven through the
// same state their onchange writes, after checking the control is rendered.
const pick = (group: 'sizes' | 'radii' | 'buttons', key: string, value: string) => {
	const id = group === 'sizes' ? `style-btn-${key === 'padX' ? 'padx' : key}-${value}` : group === 'radii' ? `style-radius-${key}-${value}` : `style-btn-${key}-${value}`;
	if (!find_test_id(id)) throw new Error(`no control ${id}`);
	(style[group] as Record<string, string>)[key] = value;
	click_test_id('style-text-regular'); // settle
};
// Button size: explicit controls override Density for buttons
click_test_id('style-density-spacious');
pick('sizes', 'height', 'height-bs');
check('explicit button height (--height-bs) wins over Spacious', [h('sample') - base.btn, h('opt-indent-tab') - base.seg], [-8, 8]);
pick('sizes', 'height', 'auto');
check('auto button height follows Density again', h('sample') - base.btn, 6);
click_test_id('style-density-compact');
pick('sizes', 'padX', 'space-lg');
check('explicit padding (--space-lg 24 vs --space-md 12) widens the button by 24', w('sample') - base.btnW, 24);
pick('sizes', 'padX', 'auto');
check('auto padding restores it', w('sample'), base.btnW);

// Button colours read the chosen token (after the colour/accent choices)
const T = () => styled_tokens('light');
check('defaults: buttons read raised / accent', [T()['wb-btn-bg'], T()['wb-btn-primary-bg']], [design.tokens.light['bg-raised'], design.tokens.light.accent]);
pick('buttons', 'primaryBg', 'black-fixed');
pick('buttons', 'primaryFg', 'white-fixed');
pick('buttons', 'bg', 'bg-sunken');
pick('buttons', 'hover', 'state-selected');
check('button colour choices apply', [T()['wb-btn-primary-bg'], T()['wb-btn-primary-fg'], T()['wb-btn-bg'], T()['wb-btn-hover-bg']], [design.tokens.light['black-fixed'], design.tokens.light['white-fixed'], design.tokens.light['bg-sunken'], design.tokens.light['state-selected']]);
pick('buttons', 'primaryBg', 'auto');
click_test_id('style-accent-orangepop');
check('auto primary background follows the Accent control', T()['wb-btn-primary-bg'], design.tokens.light.orangepop1);
click_test_id('style-accent-greenpop');

// Radius per role: explicit wins over Corners; auto follows the shifted scale
click_test_id('style-corners-round');
check('auto radii follow Corners', [T()['wb-radius-control'], T()['wb-radius-card']], [design.tokens.light['radius-bs'], design.tokens.light['radius-bs']]);
pick('radii', 'control', 'radius-sm');
pick('radii', 'pill', 'radius-xs');
check('explicit radii take the token\'s own value under Round', [T()['wb-radius-control'], T()['wb-radius-pill']], [design.tokens.light['radius-sm'], design.tokens.light['radius-xs']]);
pick('radii', 'control', 'auto');
pick('radii', 'pill', 'auto');
click_test_id('style-corners-soft');

// Corners and colours: token re-pointing (radii and colours have no bounds to measure)
click_test_id('style-corners-round');
check('round corners: --radius-md takes --radius-bs', styled_tokens('light')['radius-md'], design.tokens.light['radius-bs']);
click_test_id('style-role-surface-fractalstyler');
check('surface role takes fractalstyler\'s own value', styled_tokens('light')['bg-sunken'], design.base.light['bg-sunken']);
check('…which differs from the app palette', design.base.light['bg-sunken'] !== design.tokens.light['bg-sunken']);
click_test_id('style-accent-orangepop');
check('accent takes orangepop', styled_tokens('light').accent, design.tokens.light.orangepop1);

// Shell-level: on every surface
press('cmd-1');
press('cmd-i');
check('the editor is on Home too, with the same choices', !!find_test_id('style-editor') && find_test_id('style-accent-orangepop') !== null && style.accent === 'orangepop');

// Copy as Sass
click_test_id('style-copy');
const sass_out = last_copied() ?? '';
check('copy as Sass lists the changed tokens', sass_out.includes('$radius-md: 16px') && sass_out.includes('$accent: #ff7700'));

// Persists
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8')).slots.style;
check('choices persist', [saved.corners, saved.accent, saved.roles.surface], ['round', 'orangepop', 'fractalstyler']);

// Reset
click_test_id('style-reset');
check('reset returns to the defaults', [style.text, style.density, style.corners, style.accent, style.roles.surface], ['regular', 'compact', 'soft', 'greenpop', 'app']);
check('reset restores the app token map', JSON.stringify(styled_tokens('light')), JSON.stringify(design.tokens.light));

finish('style-editor', 29);
