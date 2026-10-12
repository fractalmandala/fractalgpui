// The dock in the window: geometry (2px gaps), docking, dragging, resizing, zoom, persistence.
// The headless harness only has clicks, so a drag is begin_drag() then a click on a drop zone;
// the press-and-move gesture that starts one is not covered here.
import './harness.ts';
import { readFileSync } from 'node:fs';
import { bounds, check, settle, click_test_id, find_test_id, finish, mount_headless, press, screenshot } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { begin_drag, close_view_leaf, dock, focused_view, move, open_view, reset_layout, resize, toggle_zoom, ui } from '../src/kernel/dock/dock.svelte.ts';
import { find_view, groups, leaves, parent_of, type Split } from '../src/kernel/dock/tree.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';

load_styles();
mount_headless(App, { width: 1400, height: 538 });

const box = (id: string) => bounds(find_test_id(id)!)!;
const gid = (view: string) => find_view(dock.root, view)!.group.id;
const lid = (view: string) => find_view(dock.root, view)!.leaf.id;
const root = () => dock.root as Split;
const shot = (n: string) => process.env.FRACTALGPUI_SHOTS && screenshot(`${process.env.FRACTALGPUI_SHOTS}/${n}.png`);

// geometry: islands separated by exactly the gap
let [ax, , aw] = box(`group-${gid('sessions')}`);
let [bx, by, , bh] = box(`group-${gid('chat')}`);
check('two panes are 2px apart', Math.round(bx - (ax + aw)), 2);
// the 32px title strip is above the dock and the 80px left strip beside it
check('the panes start 2px below the title strip and 2px right of the left strip', [Math.round(by), Math.round(ax)], [34, 82]);
check('panes fill the height down to the window bottom', bh > 400);
shot('default');

// nested: dock the bot editor below chat: still 2px
move(lid('bot-editor'), gid('chat'), 'bottom'); settle();
const chat = box(`group-${gid('chat')}`);
const editor = box(`group-${gid('bot-editor')}`);
check('a nested pane is 2px below its sibling', Math.round(editor[1] - (chat[1] + chat[3])), 2);
check('the nested panes are the same width', Math.round(chat[2]), Math.round(editor[2]));
check('the tree nests a column split inside the row', root().children[1].kind === 'split' && (root().children[1] as Split).dir === 'col');
shot('nested');

// independent views: closing one leaves every other mounted state alone
close_view_leaf(lid('bot-editor')); settle();
check('closing a view removes only it, and collapses the split', [!find_view(dock.root, 'bot-editor'), !!find_view(dock.root, 'chat'), (root().children[1] as { kind: string }).kind], [true, true, 'tabs']);

// open policy
open_view('tools'); settle();
check('a new view opens beside chat', find_view(dock.root, 'tools')?.group.id, gid('chat'));
open_view('tools'); settle();
check('opening an open view just shows it (no duplicate)', leaves(dock.root).filter((l) => l.view === 'tools').length, 1);

// drag a tab to the left edge of the chat group: a new group splits off, 2px gap holds
begin_drag(lid('tools')); settle();
check('dragging shows the drop zones over every pane', !!find_test_id(`drops-${gid('chat')}`) && !!find_test_id(`drops-${gid('sessions')}`));
click_test_id(`drop-${gid('chat')}-left`);
check('dropping on an edge splits there', [ui.drag, groups(dock.root).length, parent_of(dock.root, gid('tools'))?.children.length], ['', 3, 3]);
[ax, , aw] = box(`group-${gid('tools')}`);
[bx] = box(`group-${gid('chat')}`);
check('the new split is also 2px apart', Math.round(bx - (ax + aw)), 2);
shot('three');

// drag back into a group as a tab
begin_drag(lid('tools')); settle();
click_test_id(`drop-${gid('sessions')}-center`);
check('dropping on the centre makes it a tab of that group', [gid('tools'), groups(dock.root).length], [gid('sessions'), 2]);
check('moving views left the others intact', ['sessions', 'bots', 'chat'].every((v) => !!find_view(dock.root, v)));

// drag onto a tab strip reorders
begin_drag(lid('tools')); settle();
click_test_id(`ptab-${lid('sessions')}`);
check('dropping on a tab inserts before it', find_view(dock.root, 'tools')?.group.leaves.map((l) => l.view).slice(0, 2), ['tools', 'sessions']);
begin_drag(lid('tools')); settle();
press('escape');
check('escape cancels a drag', ui.drag, '');

// gutters and resizing
const row = root();
const gutter = `gutter-${row.id}-0`;
check('the gutter is a hit target on the seam', !!find_test_id(gutter) && bounds(find_test_id(gutter)!)![3] > 100);
const start = [...row.sizes];
resize(row.id, 0, start, 0.1); settle();
check('resizing moves the seam and keeps the total', [root().sizes[0] > start[0], Math.round((root().sizes[0] + root().sizes[1]) * 1000)], [true, 1000]);
resize(row.id, 0, start, -9); settle();
check('a pane cannot be dragged to nothing', root().sizes[0] > 0.04);
const w = box(`group-${gid('sessions')}`)[2];
check('the window follows the sizes', w > 20);

// zoom: a subtree renders as the whole window
click_test_id(`group-${gid('chat')}`);
toggle_zoom(); settle();
check('zoom renders one group alone', [!!find_test_id(`group-${gid('chat')}`), !find_test_id(`group-${gid('sessions')}`), !!find_test_id(`pzoom-${gid('chat')}`)], [true, true, true]);
const z = box(`group-${gid('chat')}`);
check('the zoomed pane fills the dock area (2px margin)', [Math.round(z[0]), Math.round(z[2])], [82, 1316]);
shot('zoom');
click_test_id(`pzoom-${gid('chat')}`);
check('un-zoom restores the layout', [ui.zoom, !!find_test_id(`group-${gid('sessions')}`)], ['', true]);

// the tab menu
click_test_id(`padd-${gid('chat')}`);
check('the + menu lists views', !!find_test_id(`pmenu-${gid('chat')}`) && !!find_test_id(`pmenu-${gid('chat')}-bots`));
click_test_id(`pmenu-${gid('chat')}-settings`);
check('choosing one opens it in that group', [gid('settings'), focused_view(), ui.menu], [gid('chat'), 'settings', '']);

// persistence + reset
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8')).slots.dock;
check('the layout is on disk with the new group', leaves(saved.root).some((l: { view: string }) => l.view === 'settings'));
reset_layout(); settle();
check('reset restores the default four views', leaves(dock.root).map((l) => l.view), ['sessions', 'bots', 'chat', 'bot-editor']);
press('cmd-k');
click_test_id('cmd-dock.zoom');
check('zoom is a palette command', ui.zoom !== '');

finish('dock', 28);
