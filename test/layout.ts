// Panel layout state: widths per surface, clamping, reset, collapse, fitting, persistence.
import './harness.ts';
import { readFileSync } from 'node:fs';
import { check, finish } from 'gpuix-svelte/test';
import { flushSync } from 'svelte';
import { emit, on } from '../src/kernel/bus.ts';
import { fit, is_collapsed, layout, LIMITS, RAIL, reset_width, set_width, toggle, toggle_all, width_of } from '../src/kernel/layout.svelte.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';

check('defaults when nothing is stored', [width_of('left', 'a'), width_of('rightA', 'a'), width_of('rightB', 'a')], [240, 340, 300]);
check('a surface default applies until resized', width_of('rightB', 'a', { rightB: 360 }), 360);
set_width('rightB', 'a', 320);
check('a resize wins over the default', width_of('rightB', 'a', { rightB: 360 }), 320);
check('widths are per surface', width_of('rightB', 'b', { rightB: 360 }), 360);
set_width('left', 'a', 9999);
set_width('rightA', 'a', 10);
check('widths clamp to their limits', [width_of('left', 'a'), width_of('rightA', 'a')], [LIMITS.left.max, LIMITS.rightA.min]);
reset_width('rightB', 'a');
check('reset returns to the default', width_of('rightB', 'a', { rightB: 360 }), 360);

toggle('rightA');
check('toggle collapses one panel', [is_collapsed('left'), is_collapsed('rightA'), is_collapsed('rightB')], [false, true, false]);
toggle_all();
check('toggle_all closes everything when anything is open', [is_collapsed('left'), is_collapsed('rightA'), is_collapsed('rightB')], [true, true, true]);
toggle_all();
check('toggle_all opens everything when all are closed', [is_collapsed('left'), is_collapsed('rightA'), is_collapsed('rightB')], [false, false, false]);

const all = { left: true, rightA: true, rightB: true };
const w = { left: 240, rightA: 340, rightB: 300 };
check('wide window shows everything', fit(1400, all, w), { left: 'open', rightA: true, rightB: true });
check('narrower drops the rightB first', fit(1100, all, w), { left: 'open', rightA: true, rightB: false });
check('narrower still drops the rightA too', fit(800, all, w), { left: 'open', rightA: false, rightB: false });
check('missing slots never show', fit(1400, { left: true, rightA: false, rightB: false }, w), { left: 'open', rightA: false, rightB: false });
toggle('left');
check('collapsed left is a rail', fit(1400, all, w).left, 'rail');
check('rail width', RAIL, 52);
toggle('left');

flushSync();
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8')).slots.layout;
check('layout persists', [saved.widths.a.left, saved.collapsed.rightA], [LIMITS.left.max, false]);

const got: string[] = [];
const off = on('surface:switch', (p) => got.push(`${p.from}>${p.to}`));
emit('surface:switch', { from: 'home', to: 'a' });
off();
emit('surface:switch', { from: 'a', to: 'b' });
check('bus delivers until unsubscribed', got, ['home>a']);
void layout;

finish('layout', 17);
