// The shell: default layout, views, palette, keymap, theme, persistence.
import './harness.ts';
import { readFileSync } from 'node:fs';
import { all_text, check, click_at, click_test_id, find_test_id, finish, mount_headless, press, screenshot, type } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { palette } from '../src/kernel/commands.svelte.ts';
import { dock, focused_view } from '../src/kernel/dock/dock.svelte.ts';
import { find_view, leaves } from '../src/kernel/dock/tree.ts';
import { settings } from '../src/kernel/settings.svelte.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';
import { css_tool } from '../src/surfaces/tools/css-to-sass/state.svelte.ts';

load_styles();
mount_headless(App, { width: 1400, height: 538 });

const shown = () => leaves(dock.root).length;
const tab = (view: string) => find_view(dock.root, view)?.leaf.id ?? '';

// default layout
check('the default layout shows sessions, bots, chat and the bot editor as tabs', ['sessions', 'bots', 'chat', 'bot-editor'].every((v) => !!find_test_id(`ptab-${tab(v)}`)));
check('the active tab of each group is mounted, the others are not', [!!find_test_id('view-sessions'), !!find_test_id('view-bots'), !!find_test_id('view-chat'), !!find_test_id('view-bot-editor')], [true, false, true, false]);
check('there is no old home / nav / sidebar chrome', !find_test_id('nav-home') && !find_test_id('toggle-sidebar-left') && !find_test_id('section-sidebar-left') && !find_test_id('surface-home'));
check('status bar names the focused view', find_test_id('footer-focus') !== null && all_text().includes('Chat'));

// opening views: a new one goes to the main area, an open one just comes forward
click_test_id(`ptab-${tab('bots')}`);
check('clicking a tab shows it and focuses its group', [!!find_test_id('view-bots'), !find_test_id('view-sessions'), focused_view()], [true, true, 'bots']);
press('cmd-4');
check('cmd-N opens the Nth view (a tab of the main group)', [focused_view(), !!find_test_id('surface-bots-editor')], ['bot-editor', true]);

// palette
press('cmd-k');
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/palette.png`);
check('cmd-k opens the palette', palette.open && !!find_test_id('palette-input'));
check('palette lists commands and views', !!find_test_id('cmd-theme.toggle') && !!find_test_id('cmd-view.open.tools') && !!find_test_id('cmd-dock.reset'));
type('t o o l s');
check('typing filters', palette.query, 'tools');
press('enter');
check('enter runs the selection: Tools opens as a new tab and closes the palette', !palette.open && !!find_test_id('surface-tools') && focused_view() === 'tools');
check('the Tools view hosts its tool list', !!find_test_id('tool-item-css-to-sass') && !!find_test_id('tool-css-to-sass'));
check('the tab is in the main group (beside chat)', find_view(dock.root, 'tools')?.group.id === find_view(dock.root, 'chat')?.group.id);

press('cmd-k');
press('escape');
check('escape closes the palette', !palette.open && !find_test_id('palette'));
press('cmd-k');
click_test_id('cmd-theme.toggle');
check('clicking a command runs it', settings.theme, 'light');
press('cmd-k');
click_at(8, 530); // the scrim, outside the dialog
check('clicking the scrim closes', palette.open, false);
press('cmd-shift-l');
check('cmd-shift-l toggles the theme', settings.theme, 'dark');

// keep-alive: a view's state outlives its tab
css_tool.css = '.kept { color: red }';
click_test_id(`pclose-${tab('tools')}`);
check('closing a tab removes only that view', [!find_test_id('surface-tools'), !!find_view(dock.root, 'chat')], [true, true]);
press('cmd-k');
type('t o o l s');
press('enter');
check('view state survives closing and reopening', css_tool.css, '.kept { color: red }');

// closing the focused tab by key
const before = shown();
press('cmd-w');
check('cmd-w closes the focused tab', shown(), before - 1);

// persistence
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8'));
check('settings.json keeps the theme and the layout tree', saved.version === 1 && saved.slots.app.theme === 'dark' && saved.slots.dock.root.kind === 'split' && !('activeSurface' in saved.slots.app));
check('tool state persisted', saved.slots['tool.css-to-sass'].css, '.kept { color: red }');

finish('shell', 21);
