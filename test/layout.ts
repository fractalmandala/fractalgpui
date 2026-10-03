// Panel layout state: widths per surface, clamping, reset, collapse, fitting, persistence.
import './harness.ts';
import { readFileSync } from 'node:fs';
import { check, finish } from 'gpuix-svelte/test';
import { flushSync } from 'svelte';
import { emit, on } from '../src/kernel/bus.ts';
import { fit, is_collapsed, layout, LIMITS, RAIL, reset_width, set_width, toggle, toggle_all, width_of } from '../src/kernel/layout.svelte.ts';
import { flush, settings_file } from '../src/kernel/storage.svelte.ts';

check('defaults when nothing is stored', [width_of('left', 'a'), width_of('agent', 'a'), width_of('inspector', 'a')], [240, 340, 300]);
check('a surface default applies until resized', width_of('inspector', 'a', { inspector: 360 }), 360);
set_width('inspector', 'a', 320);
check('a resize wins over the default', width_of('inspector', 'a', { inspector: 360 }), 320);
check('widths are per surface', width_of('inspector', 'b', { inspector: 360 }), 360);
set_width('left', 'a', 9999);
set_width('agent', 'a', 10);
check('widths clamp to their limits', [width_of('left', 'a'), width_of('agent', 'a')], [LIMITS.left.max, LIMITS.agent.min]);
reset_width('inspector', 'a');
check('reset returns to the default', width_of('inspector', 'a', { inspector: 360 }), 360);

toggle('agent');
check('toggle collapses one panel', [is_collapsed('left'), is_collapsed('agent'), is_collapsed('inspector')], [false, true, false]);
toggle_all();
check('toggle_all closes everything when anything is open', [is_collapsed('left'), is_collapsed('agent'), is_collapsed('inspector')], [true, true, true]);
toggle_all();
check('toggle_all opens everything when all are closed', [is_collapsed('left'), is_collapsed('agent'), is_collapsed('inspector')], [false, false, false]);

const all = { left: true, agent: true, inspector: true };
const w = { left: 240, agent: 340, inspector: 300 };
check('wide window shows everything', fit(1400, all, w), { left: 'open', agent: true, inspector: true });
check('narrower drops the inspector first', fit(1100, all, w), { left: 'open', agent: true, inspector: false });
check('narrower still drops the agent too', fit(800, all, w), { left: 'open', agent: false, inspector: false });
check('missing slots never show', fit(1400, { left: true, agent: false, inspector: false }, w), { left: 'open', agent: false, inspector: false });
toggle('left');
check('collapsed left is a rail', fit(1400, all, w).left, 'rail');
check('rail width', RAIL, 52);
toggle('left');

flushSync();
flush();
const saved = JSON.parse(readFileSync(settings_file(), 'utf8')).slots.layout;
check('layout persists', [saved.widths.a.left, saved.collapsed.agent], [LIMITS.left.max, false]);

const got: string[] = [];
const off = on('agent:attach', (p) => got.push(`${p.surface}:${p.text}`));
emit('agent:attach', { surface: 'css-to-sass', label: 'Output', text: '.a' });
off();
emit('agent:attach', { surface: 'css-to-sass', label: 'Output', text: '.b' });
check('bus delivers until unsubscribed', got, ['css-to-sass:.a']);
void layout;

finish('layout', 17);
