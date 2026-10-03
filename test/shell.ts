import './harness.ts';
import { readFileSync } from 'node:fs';
import { all_text, check, click_at, click_test_id, find_test_id, finish, mount_headless, press, screenshot, type } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { palette } from '../src/kernel/commands.svelte.ts';
import { settings } from '../src/kernel/settings.svelte.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';
import { css_tool } from '../src/surfaces/css-to-sass/state.svelte.ts';

load_styles();
mount_headless(App, { width: 1400, height: 538 });

check('starts on home', !!find_test_id('tool-home'));
check('nav lists the converter', !!find_test_id('nav-css-to-sass'));
check('status bar shows the tool', all_text().includes('Fractal workbench'));

// home grid
check('home lists surfaces as cards', !!find_test_id('home-open-css-to-sass'));
check('home lists only real surfaces', !all_text().includes('Planned') && !find_test_id('planned-card'));
check('home carries no style diagnostics', !all_text().includes('declarations dropped') && !all_text().includes('Styles'));
click_test_id('home-open-css-to-sass');
check('a home card opens its surface', settings.activeSurface, 'css-to-sass');
press('cmd-1');

// rail switching
click_test_id('nav-css-to-sass');
check('rail switches tools', !!find_test_id('tool-css-to-sass') && !find_test_id('tool-home'));
check('active tool persisted to settings', settings.activeSurface, 'css-to-sass');

// keymap
press('cmd-1');
check('cmd-1 goes home', !!find_test_id('tool-home'));
press('cmd-2');
check('cmd-2 goes to the converter', !!find_test_id('tool-css-to-sass'));

// keep-alive: tool state outlives the page
css_tool.css = '.kept { color: red }';
press('cmd-1');
press('cmd-2');
check('tool state survives switching', css_tool.css, '.kept { color: red }');

// command palette
press('cmd-k');
if (process.env.FRACTALGPUI_SHOTS) screenshot(`${process.env.FRACTALGPUI_SHOTS}/palette.png`);
check('cmd-k opens the palette', palette.open && !!find_test_id('palette-input'));
check('palette lists commands', !!find_test_id('cmd-theme.toggle') && !!find_test_id('cmd-tool.open.home'));
type('h o m e');
check('typing filters', palette.query, 'home');
check('filtered list has "Go to Home" first', !!find_test_id('cmd-tool.open.home') && !find_test_id('cmd-theme.toggle'));
press('enter');
check('enter runs the selection and closes', !palette.open && !!find_test_id('tool-home'));

press('cmd-k');
press('escape');
check('escape closes the palette', !palette.open && !find_test_id('palette'));

press('cmd-k');
click_test_id('cmd-theme.toggle');
check('clicking a command runs it', settings.theme, 'light');
press('cmd-k');
click_at(8, 530); // the scrim, outside the dialog
check('clicking the scrim closes', palette.open, false);

// theme
press('cmd-shift-l');
check('cmd-shift-l toggles the theme', settings.theme, 'dark');
click_test_id('theme-toggle');
check('rail toggle toggles the theme', settings.theme, 'light');

// persistence
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8'));
check('settings.json has version and slots', saved.version === 1 && saved.slots.app.theme === 'light' && saved.slots.app.activeSurface === 'home');
check('tool state persisted', saved.slots['tool.css-to-sass'].css, '.kept { color: red }');

finish('shell', 24);
