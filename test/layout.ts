// Panel layout state: widths per surface, clamping, reset, collapse, fitting, persistence.
import './harness.ts';
import { readFileSync } from 'node:fs';
import { check, finish } from 'gpuix-svelte/test';
import { flushSync } from 'svelte';
import { emit, on } from '../src/kernel/bus.ts';
import { fit, is_collapsed, layout, LIMITS, reset_width, set_width, toggle, toggle_all, width_of } from '../src/kernel/layout.svelte.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';

const L = 'sidebar-left', P = 'sidebar-panel', R = 'sidebar-right';
const a = { id: 'a' };
const b = { id: 'b' };
const a_wide = { id: 'a', layout: { [R]: 360 } };
const b_wide = { id: 'b', layout: { [R]: 360 } };

check('defaults when nothing is stored', [width_of(L, a), width_of(P, a), width_of(R, a)], [280, 280, 280]);
check('a surface default applies until resized', width_of(R, a_wide), 360);
set_width(R, a, 320);
check('a resize wins over the default', width_of(R, a_wide), 320);
check('widths are per surface', width_of(R, b_wide), 360);
set_width(L, a, 9999);
set_width(P, a, 10);
check('widths clamp to their limits', [width_of(L, a), width_of(P, a)], [LIMITS[L].max, LIMITS[P].min]);
reset_width(R, a);
check('reset returns to the default', width_of(R, a_wide), 360);

// open state
check('left open, panel and right collapsed by default', [is_collapsed(L, a), is_collapsed(P, a), is_collapsed(R, a)], [false, true, true]);
const opens = { id: 'c', collapsed: { [P]: false } };
check('a surface can declare its own defaults', [is_collapsed(P, opens), is_collapsed(R, opens)], [false, true]);
toggle(P, a);
check('toggle opens one sidebar on that surface only', [is_collapsed(P, a), is_collapsed(P, b)], [false, true]);
toggle(P, opens);
check('a toggle overrides the surface default', is_collapsed(P, opens), true);
toggle(L, a);
check('sidebar-left is app-wide', [is_collapsed(L, a), is_collapsed(L, b)], [true, true]);
toggle(L, a);
toggle_all(a);
check('toggle_all collapses everything when anything is open', [is_collapsed(L, a), is_collapsed(P, a), is_collapsed(R, a)], [true, true, true]);
toggle_all(a);
check('toggle_all opens everything when all are collapsed', [is_collapsed(L, a), is_collapsed(P, a), is_collapsed(R, a)], [false, false, false]);
check('other surfaces keep their own state', [is_collapsed(P, b), is_collapsed(R, b)], [true, true]);

const w = { [L]: 240, [P]: 340, [R]: 300 } as const;
check('wide window fits everything open', [fit(1400, a, w).open[L], fit(1400, a, w).fits[R]], [true, true]);
check('narrower drops sidebar-right first', [fit(1100, a, w).fits[P], fit(1100, a, w).fits[R]], [true, false]);
check('narrower still drops sidebar-panel too', [fit(800, a, w).fits[P], fit(800, a, w).fits[R]], [false, false]);
check('collapsed sidebars never show', [fit(1400, b, w).open[L], fit(1400, b, w).open[P]], [true, false]);
toggle(L, a);
check('collapsing left keeps it mounted (it animates to 0, never a rail)', [fit(1400, a, w).open[L], fit(1400, a, w).fits[L]], [false, true]);
toggle(L, a);

flushSync();
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8')).slots.shell;
check('layout persists', [saved.widths.a[L], saved.collapsed.a[P], saved.leftCollapsed], [LIMITS[L].max, false, false]);

const got: string[] = [];
const off = on('surface:switch', (p) => got.push(`${p.from}>${p.to}`));
emit('surface:switch', { from: 'home', to: 'a' });
off();
emit('surface:switch', { from: 'a', to: 'b' });
check('bus delivers until unsubscribed', got, ['home>a']);
void layout;

finish('layout', 21);
