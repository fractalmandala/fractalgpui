import '../../../test/harness.ts';
import { check, click_test_id, find_test_id, finish, focus, mount_headless, painted, screenshot, type } from 'gpuix-svelte/test';
import { load_styles } from '../../../build/styles.ts';
import App from '../../App.svelte';
import { last_copied } from '../../kernel/clipboard.ts';
import { switch_to } from '../../kernel/settings.svelte.ts';
import { status } from '../../kernel/status.svelte.ts';
import { css_tool, SAMPLE } from './state.svelte.ts';

load_styles();
css_tool.css = '.a { color: red }\n.a .b { margin: 0 }';
css_tool.nest = true;
switch_to('css-to-sass');
mount_headless(App, { width: 1400, height: 538 });

check('page mounts', !!find_test_id('css-input') && !!find_test_id('sass-output'));
check('output is nested Sass', painted().includes('.a') && painted().includes('color: red') && painted().includes('.b'));
check('stats line', painted().includes('2 rules · 1 nested'));

click_test_id('opt-nest');
check('nest toggle turns nesting off', !css_tool.nest && painted().includes('0 nested'));
click_test_id('opt-nest');

click_test_id('copy');
check('copy puts the Sass on the clipboard', last_copied(), '.a\n\tcolor: red\n\t.b\n\t\tmargin: 0\n');
check('copy flashes the status bar', status.message.startsWith('Copied 4 lines') && !!find_test_id('status-message'));

click_test_id('opt-indent-2');
click_test_id('copy');
check('indent option applies', last_copied(), '.a\n  color: red\n  .b\n    margin: 0\n');

css_tool.css = '.broken { color: red';
click_test_id('nav-css-to-sass'); // any event settles the change
check('parse errors are shown', !!find_test_id('sass-error') && !find_test_id('sass-output'));

click_test_id('clear');
check('clear empties the input', css_tool.css, '');
const input = find_test_id('css-input');
if (input) focus(input);
type('. x { c o l o r : space b l u e }');
check('typing in the textarea converts live', css_tool.css, '.x{color: blue}');
check('typed CSS reaches the output', painted().includes('.x') && painted().includes('color: blue'));

click_test_id('sample');
check('sample loads', css_tool.css, SAMPLE);
check('first output line (a comment) is painted, not clipped', painted().includes('// Buttons'));
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/css-to-sass.png`);

finish('css-to-sass', 13);
