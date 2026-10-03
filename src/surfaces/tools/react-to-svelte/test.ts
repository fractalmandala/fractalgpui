import '../../../../test/harness.ts';
import { bounds, check, click_test_id, find_test_id, finish, focus, mount_headless, painted, screenshot, type } from 'gpuix-svelte/test';
import { load_styles } from '../../../../build/styles.ts';
import App from '../../../App.svelte';
import { last_copied } from '../../../kernel/clipboard.ts';
import { all_commands } from '../../../kernel/commands.svelte.ts';
import { settings, switch_to } from '../../../kernel/settings.svelte.ts';
import { status } from '../../../kernel/status.svelte.ts';
import { tools_state } from '../state.svelte.ts';
import { SAMPLES } from './samples.ts';
import { convert, headline, r2s_tool } from './state.svelte.ts';

load_styles();
r2s_tool.source = SAMPLES[1].source; // Counter
r2s_tool.history = [];
r2s_tool.file = '';
tools_state.active = 'react-to-svelte';
switch_to('tools');
mount_headless(App, { width: 1400, height: 860 });
const settle = () => click_test_id('tool-item-react-to-svelte'); // any event settles a state change

check('the tool is listed after CSS ⇄ Sass', !!find_test_id('tool-item-css-to-sass') && !!find_test_id('tool-item-react-to-svelte'));
check('page mounts with input and output', !!find_test_id('react-input') && !!find_test_id('svelte-output'));
check('output is Svelte 5 with runes', painted().includes('let count = $state(0);') && painted().includes('onclick={() => count = count - step}'));
check('stats line names the files', painted().includes('1 file ·'));
check('the output file is a surface tab', !!find_test_id('surface-tabs-Counter.svelte'));

click_test_id('r2s-copy');
check('copy puts the Svelte file on the clipboard', last_copied(), (convert() as { ok: true; result: { svelte: string } }).result.svelte);
check('copy flashes the status bar', status.message.startsWith('Copied Counter.svelte'));
{
	// Lines sit level: the textarea's fixed 26px row pitch, and the <code> output on the same pitch.
	const out = bounds(find_test_id('svelte-output')!)!;
	const lines = (convert() as { ok: true; result: { svelte: string } }).result.svelte.split('\n').length;
	check('code output uses the textarea row pitch (26px)', Math.round(out[3] / lines), 26);
	const input = bounds(find_test_id('react-input')!)!;
	check('textarea rows are 26px (inside its 8px padding)', (input[3] - 16) % 26, 0);
}
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/react-to-svelte.png`);

// samples (left sidebar)
check('left sidebar lists the eight samples', SAMPLES.length === 8 && SAMPLES.every((s) => !!find_test_id(`r2s-sample-${s.id}`)));
click_test_id('r2s-sample-users');
check('clicking a sample loads it', r2s_tool.source, SAMPLES[5].source);
check('early returns render as an {#if} chain', painted().includes('{#if loading}') && painted().includes('{:else if error}'));
check('warnings are listed under the panes', !!find_test_id('svelte-warnings') && painted().includes('getContext(ThemeContext)'));

// several components → several files, one tab each
r2s_tool.source = `function Item({ label }) { return <li>{label}</li>; }\nexport default function List({ xs }) { return <ul>{xs.map((x) => <Item key={x} label={x} />)}</ul>; }`;
settle();
check('one tab per output file, main first', [!!find_test_id('surface-tabs-List.svelte'), !!find_test_id('surface-tabs-Item.svelte')], [true, true]);
check('the main file imports the other', painted().includes("import Item from './Item.svelte';"));
click_test_id('surface-tabs-Item.svelte');
check('a tab shows its file', [r2s_tool.file, painted().includes('<li>{label}</li>'), painted().includes("import Item from")], ['Item.svelte', true, false]);
click_test_id('r2s-copy');
check('copy takes the file shown', (last_copied() ?? '').includes('<li>{label}</li>') && status.message.startsWith('Copied Item.svelte'));
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/react-to-svelte-files.png`);
all_commands().find((c) => c.id === 'react-to-svelte.next-file')!.run();
settle();
check('the next-file command cycles the tabs', r2s_tool.file, 'List.svelte');

// errors
r2s_tool.source = 'export default function A() {\n  const x = ;\n  return <p />;\n}';
settle();
check('syntax errors show their line, no output', !!find_test_id('react-error') && !find_test_id('svelte-output') && painted().includes('Line 2:'));
click_test_id('r2s-copy');
check('copy refuses while the input has an error', status.message, 'Nothing to copy: the React input has an error');

// typing converts live
click_test_id('r2s-clear');
check('clear empties the input', r2s_tool.source, '');
const input = find_test_id('react-input');
if (input) focus(input);
type('x');
check('typing in the textarea converts live', [r2s_tool.source, !!find_test_id('react-error'), painted().includes('No React component found')], ['x', true, true]);

// recent inputs
check('replaced inputs are kept, newest first', r2s_tool.history.map((h) => headline(h.source)), ['A', 'List']);
click_test_id('r2s-history-1');
check('clicking a recent input restores it', r2s_tool.source.startsWith('function Item'));
click_test_id('r2s-history-clear');
check('recent inputs can be cleared', r2s_tool.history.length === 0 && !find_test_id('r2s-history-0'));

// a tool command opens Tools on this tool
switch_to('home');
all_commands().find((c) => c.id === 'react-to-svelte.sample')!.run();
click_test_id('surface-tools'); // settle
check('a tool command opens Tools on React → Svelte', [settings.activeSurface, tools_state.active, r2s_tool.source === SAMPLES[0].source], ['tools', 'react-to-svelte', true]);
r2s_tool.source = SAMPLES[7].source;
settle();
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/react-to-svelte-warnings.png`);
tools_state.active = 'css-to-sass';

finish('react-to-svelte', 26);
