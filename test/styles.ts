// The strict style check: every class the app uses exists, and nothing it relies on
// was dropped on the way to GPUI (beyond the allow-list in build/allow.ts).
import './harness.ts';
import { check, finish } from 'gpuix-svelte/test';
import { readFileSync } from 'node:fs';
import { build_styles, style_problems } from '../build/styles.ts';

const build = build_styles();
const problems = style_problems(build);
for (const p of problems) console.log(`  problem: ${p}`);

check('fractalstyler compiled', build.fractalstyler.sheets.length > 0);
check('app uses classes', build.used.size > 30);
check('rules registered after pruning', build.registered > 30);
check('no unknown classes and no unexpected losses', problems, []);

const { light, dark } = build.tokens;
check('space-sm flattened to px', dark['space-sm'], '8px');
check('text-lg flattened to px', dark['text-lg'], '20px');
check('neutral canvas: white / black', [light.bg, dark.bg], ['#FFFFFF', '#000000']);
check('neutral surfaces and borders', [light['bg-surface'], light['bg-sunken'], light.border, dark['bg-surface'], dark['bg-raised'], dark.border], ['#FAFAFA', '#F5F5F5', '#EBEBEB', '#0A0A0A', '#111111', '#1F1F1F']);
check('accent is greenpop1 in both modes', [light['theme-color'], dark['theme-color'], light.accent, dark.accent], ['#00e676', '#00e676', '#00e676', '#00e676']);
check('fractalstyler black-fixed text on the accent', dark['on-accent'], '#171717');
check('sans font is the installed variable family', dark['font-sans'], 'General Sans Variable');
check('app token --font-mono present', dark['font-mono'], 'Menlo');
check('own classes all translated', ['wb-btn', 'section-sidebar-left', 'section-main-header', 'section-main-footer', 'wb-palette', 'wb-scrim'].every((c) => build.defined.has(c)));

// _own.sass sizes go through fractalstyler tokens (assets/token-audit.md): no literal px
// for these properties, except the documented no-token cases below.
const SIZED = /^(font-size|padding(-\w+)?|margin(-\w+)?|gap|row-gap|column-gap|(min-|max-)?height|(min-|max-)?width|border(-\w+)*-radius)$/;
const LITERAL_OK: Record<string, string> = {
	'.wb-toggle padding: 2px': "fractalstyler's .switch-track geometry (1px border + 2px padding around --switch-thumb = --switch-h)",
	'.section-sidebar-left.rail width: 52px': 'layout width, no token (kernel/layout RAIL)'
};
const own = readFileSync(new URL('../src/styles/_own.sass', import.meta.url), 'utf8');
const literals: string[] = [];
const vars = new Set<string>();
let selector = '';
for (const line of own.split('\n')) {
	const code = line.replace(/(^|\s)\/\/.*$/, '').trimEnd();
	if (/^\S/.test(code) && !code.startsWith('//')) selector = code.split(/\s/)[0];
	for (const m of code.matchAll(/var\(--([\w-]+)/g)) vars.add(m[1]);
	const decl = code.trim().match(/^([a-z-]+):\s*(.+)$/);
	if (!decl || !SIZED.test(decl[1]) || !/\d(\.\d+)?px\b/.test(decl[2])) continue;
	const key = `${selector} ${decl[1]}: ${decl[2]}`;
	if (!LITERAL_OK[key]) literals.push(key);
}
for (const l of literals) console.log(`  literal: ${l}`);
check('_own.sass: no literal px sizes outside the documented no-token cases', literals, []);
const missing = [...vars].filter((v) => light[v] === undefined || dark[v] === undefined);
check('every var() in _own.sass is in the runtime token map (both modes)', missing, []);
const own_text = build.rules.filter((r) => r.classes.includes('wb-btn') && r.classes.length === 1).map((r) => ('css' in r ? r.css : '')).join(';');
check('own rules keep token vars live for set_css_vars', /height: var\(--wb-btn-height\)/.test(own_text) && /font-size: var\(--text-sm\)/.test(own_text), true);

finish('styles', 16);
