import '../../../../test/harness.ts';
import { check, click_test_id, find_test_id, finish, focus, mount_headless, painted, screenshot, type } from 'gpuix-svelte/test';
import { load_styles } from '../../../../build/styles.ts';
import App from '../../../App.svelte';
import { last_copied } from '../../../kernel/clipboard.ts';
import { all_commands } from '../../../kernel/commands.svelte.ts';
import { settings, switch_to } from '../../../kernel/settings.svelte.ts';
import { status } from '../../../kernel/status.svelte.ts';
import { css_tool, headline, SAMPLE, SAMPLES } from './state.svelte.ts';

load_styles();
css_tool.css = '.a { color: red }\n.a .b { margin: 0 }';
css_tool.nest = true;
css_tool.history = [];
css_tool.tab = 'convert';
switch_to('tools');
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
click_test_id('tool-item-css-to-sass'); // any event settles the change
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

// left sidebar: samples and recent inputs
check('left sidebar lists the samples', SAMPLES.every((x) => !!find_test_id(`sample-${x.id}`)));
check('replaced and copied inputs are kept, newest first', css_tool.history.map((h) => h.css), ['.x{color: blue}', '.broken { color: red', '.a { color: red }\n.a .b { margin: 0 }']);
click_test_id('history-1');
check('clicking a recent input restores it', css_tool.css, '.broken { color: red');
click_test_id('sample-layout');
check('clicking a sample loads it', css_tool.css, SAMPLES[1].css);
check('headline is the first selector', headline(SAMPLES[2].css), '.prose');

// Convert / Diff tabs
click_test_id('surface-tabs-diff');
check('diff tab shows the round trip', (css_tool.tab as string) === 'diff' && !!find_test_id('diff-view') && !find_test_id('css-input'));
css_tool.css = '.a { color: red }\n.a .b { margin: 0 }';
click_test_id('surface-tabs-diff');
check('an exact conversion reports identical', !!find_test_id('diff-identical'));
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/css-to-sass-diff.png`);
click_test_id('surface-tabs-convert');
check('convert tab returns to the panes', !!find_test_id('css-input'));
click_test_id('history-clear');
check('recent inputs can be cleared', css_tool.history.length === 0 && !find_test_id('history-0'));

// hosted by the Tools surface
check('the tool list sits above the tool\'s own sidebar', !!find_test_id('tool-list') && !!find_test_id('tool-item-css-to-sass') && !!find_test_id('sample-components'));
switch_to('home');
all_commands().find((c) => c.id === 'css-to-sass.diff')!.run();
click_test_id('surface-tools'); // settle
check('a tool command opens Tools on that tool', [settings.activeSurface, css_tool.tab, !!find_test_id('diff-view')], ['tools', 'diff', true]);

finish('css-to-sass', 24);
