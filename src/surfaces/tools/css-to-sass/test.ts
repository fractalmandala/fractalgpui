import '../../../../test/harness.ts';
import { bounds, check, click_test_id, find_test_id, finish, focus, mount_headless, painted, screenshot, type } from 'gpuix-svelte/test';
import { load_styles } from '../../../../build/styles.ts';
import App from '../../../App.svelte';
import { last_copied } from '../../../kernel/clipboard.ts';
import { all_commands } from '../../../kernel/commands.svelte.ts';
import { settings, switch_to } from '../../../kernel/settings.svelte.ts';
import { status } from '../../../kernel/status.svelte.ts';
import { convert, css_tool, detect_syntax, history_of, headline, SAMPLE, SAMPLES, SASS_SAMPLE, SASS_SAMPLES } from './state.svelte.ts';

load_styles();
css_tool.css = '.a { color: red }\n.a .b { margin: 0 }';
css_tool.nest = true;
css_tool.history = [];
css_tool.tab = 'convert';
css_tool.direction = 'css-to-sass';
css_tool.sass = SASS_SAMPLE;
css_tool.syntax = 'auto';
css_tool.style = 'expanded';
switch_to('tools');
mount_headless(App, { width: 1400, height: 640 }); // tall enough for the tool list plus every sample and recent row

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
{
	// Lines sit level: the textarea's fixed 26px row pitch, and the <code> output on the same pitch.
	const input = bounds(find_test_id('css-input')!)!;
	const out = bounds(find_test_id('sass-output')!)!;
	const lines = (convert().ok ? (convert() as { result: { sass: string } }).result.sass : '').split('\n').length;
	check('code output uses the textarea row pitch (26px)', Math.round(out[3] / lines), 26);
	check('textarea rows are 26px (inside its 8px padding)', (input[3] - 16) % 26, 0);
}
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

// Sass → CSS
const settle = () => click_test_id('tool-item-css-to-sass');
switch_to('tools');
settle();
click_test_id('opt-direction-sass-to-css');
check('direction toggle switches to Sass → CSS', [css_tool.direction, !!find_test_id('sass-input'), !find_test_id('css-input')], ['sass-to-css', true, true]);
check('only Sass → CSS options show', [!!find_test_id('opt-syntax'), !!find_test_id('opt-style'), !!find_test_id('opt-nest'), !!find_test_id('opt-comments')], [true, true, false, false]);
check('Diff is hidden for Sass → CSS', [!!find_test_id('surface-tabs-convert'), !!find_test_id('surface-tabs-diff')], [true, false]);
check('the sample compiles to CSS', !!find_test_id('css-output') && painted().includes('.btn.primary:focus-visible') && painted().includes('outline-offset: 2px'));
check('samples are per direction', [SASS_SAMPLES.every((x) => !!find_test_id(`sample-${x.id}`)), !!find_test_id('sample-components')], [true, false]);
css_tool.sass = '$c: red\n.a\n\tcolor: $c\n\t.b\n\t\tmargin: 0\n';
settle();
click_test_id('copy');
check('indented Sass compiles; copy puts the CSS on the clipboard', last_copied(), '.a {\n  color: red;\n}\n.a .b {\n  margin: 0;\n}\n');
check('copy flashes the CSS line count', status.message, 'Copied 6 lines of CSS');
click_test_id('opt-style-compressed');
click_test_id('copy');
check('compressed output style', last_copied(), '.a{color:red}.a .b{margin:0}\n');
click_test_id('opt-style-expanded');
css_tool.sass = '.card { .title { font-weight: 600; } }';
settle();
check('SCSS is auto-detected', [detect_syntax(css_tool.sass), painted().includes('SCSS ·'), painted().includes('.card .title')], ['scss', true, true]);
check('interpolation braces do not make Sass look like SCSS', detect_syntax('.pad-#{$n}\n\tpadding: 1px'), 'indented');
click_test_id('opt-syntax-indented');
check('forcing the indented syntax on SCSS shows the compile error inline', !!find_test_id('css-error') && !find_test_id('css-output'));
click_test_id('opt-syntax-auto');
css_tool.sass = '.a\n\tcolor: $missing\n';
settle();
check('compile errors name the line', !!find_test_id('css-error') && painted().includes('Line 2: Undefined variable.'));

// Swap: output becomes the other direction's input
css_tool.sass = '.a\n\tcolor: red\n';
css_tool.indent = 'tab';
settle();
click_test_id('swap');
check('swap moves the CSS into CSS → Sass', [css_tool.direction, css_tool.css], ['css-to-sass', '.a {\n  color: red;\n}\n']);
check('swapping back shows Convert and Diff again', !!find_test_id('css-input') && !!find_test_id('surface-tabs-diff'));
click_test_id('swap');
check('swap moves the Sass back into Sass → CSS', [css_tool.direction, css_tool.sass], ['sass-to-css', '.a\n\tcolor: red\n']);
const sass_in = '$c: red\n.a\n\tcolor: $c\n\t.b\n\t\tmargin: 0\n';
check('recent inputs are per direction', [!!find_test_id('history-0'), history_of('sass-to-css').some((h) => h.css === sass_in), history_of('css-to-sass').some((h) => h.css === sass_in)], [true, true, false]);
check('a Sass headline is its first line', headline('// note\n.btn\n\tcolor: red'), '.btn');
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/sass-to-css.png`);
click_test_id('opt-direction-css-to-sass');
check('direction toggles back', css_tool.direction, 'css-to-sass');

finish('css-to-sass', 44);
