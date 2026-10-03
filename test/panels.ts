// Shell regions: collapse (keys, buttons, rail), resize by dragging, per-surface widths.
import './harness.ts';
import { get_native } from 'gpuix-svelte/renderer';
import { bounds, check, click_test_id, drain, find_test_id, finish, mount_headless, press, settle } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { is_collapsed, LIMITS, width_of } from '../src/kernel/layout.svelte.ts';
import { active_surface } from '../src/kernel/surfaces.svelte.ts';
import { switch_to } from '../src/kernel/settings.svelte.ts';

type Mouse = {
	simulateMouseDown(x: number, y: number, b?: number): void;
	simulateMouseMove(x: number, y: number, b?: number | null): void;
	simulateMouseUp(x: number, y: number, b?: number): void;
	flush(): void;
};

load_styles();
switch_to('tools');
mount_headless(App, { width: 1400, height: 538 });
const native = get_native() as unknown as Mouse;
const step = (f: () => void) => {
	f();
	native.flush();
	drain();
	settle();
};
const has = (id: string) => !!find_test_id(id);
const width = (id: string) => bounds(find_test_id(id)!)?.[2] ?? -1;
const all_text_in = (id: string): string[] => {
	const out: string[] = [];
	const walk = (n: { text?: string; children?: unknown[] } | null | undefined) => {
		if (!n) return;
		if (typeof n.text === 'string') out.push(n.text);
		for (const c of n.children ?? []) walk(c as typeof n);
	};
	walk(find_test_id(id) as never);
	return out;
};
const near = (a: number, b: number) => Math.abs(a - b) <= 1;

/** Drags a splitter horizontally by dx (press, two moves, release). */
function drag(id: string, dx: number) {
	const b = bounds(find_test_id(id)!)!;
	const x = b[0] + b[2] / 2;
	const y = b[1] + 120;
	step(() => native.simulateMouseDown(x, y, 0));
	step(() => native.simulateMouseMove(x + dx / 2, y, 0));
	step(() => native.simulateMouseMove(x + dx, y, 0));
	step(() => native.simulateMouseUp(x + dx, y, 0));
}

const L = 'sidebar-left', P = 'sidebar-panel', R = 'sidebar-right';
const css = () => active_surface();

// sections and defaults
check('all four sections exist', [has('section-sidebar-left'), has('section-main'), has('section-main-header'), has('section-main-body'), has('section-main-footer')], [true, true, true, true, true]);
check('sidebar-panel and sidebar-right start collapsed', [has('section-sidebar-panel'), has('section-sidebar-right')], [false, false]);
click_test_id('toggle-sidebar-panel');
click_test_id('toggle-sidebar-right');
check('the header toggles open them', [has('section-sidebar-panel'), has('section-sidebar-right')], [true, true]);
check('sidebars start at their default widths', [near(width('section-sidebar-left'), 280), near(width('section-sidebar-panel'), 280), near(width('section-sidebar-right'), 280)], [true, true, true]);
check('sidebars are empty containers unless the surface fills them', [has('section-sidebar-panel-body'), has('section-sidebar-right-body'), all_text_in('section-sidebar-panel').length, all_text_in('section-sidebar-right').length], [true, true, 0, 0]);
check('main is not collapsible', !has('section-main-collapse') && !has('toggle-section-main'));

// collapse
press('cmd-b');
check('⌘B collapses the left sidebar to the icon rail', [has('section-sidebar-left'), has('section-sidebar-left-rail'), near(width('section-sidebar-left-rail'), 52)], [false, true, true]);
click_test_id('sidebar-left-expand');
check('the rail expands it again', has('section-sidebar-left') && !has('section-sidebar-left-rail'));
click_test_id('sidebar-left-collapse');
check('the header button collapses it', has('section-sidebar-left-rail'));
press('cmd-b');

press('cmd-j');
check('⌘J collapses sidebar-panel', !has('section-sidebar-panel') && is_collapsed(P, css()));
click_test_id('toggle-sidebar-panel');
check('the header toggle reopens it', has('section-sidebar-panel'));
click_test_id('sidebar-panel-collapse');
check('its own button collapses it', !has('section-sidebar-panel'));
press('cmd-j');

press('cmd-i');
check('⌘I collapses sidebar-right', !has('section-sidebar-right'));
press('cmd-i');
press('cmd-\\');
check('⌘\\ collapses every sidebar', [has('section-sidebar-left'), has('section-sidebar-left-rail'), has('section-sidebar-panel'), has('section-sidebar-right'), has('section-main')], [false, true, false, false, true]);
press('cmd-\\');
check('⌘\\ again opens them all', [has('section-sidebar-left'), has('section-sidebar-panel'), has('section-sidebar-right')], [true, true, true]);

// resize
drag('sidebar-left-splitter', 60);
check('dragging the left splitter widens the sidebar', [width_of(L, css()), near(width('section-sidebar-left'), 340)], [340, true]);
drag('sidebar-panel-splitter', -80);
check('dragging a right splitter leftwards widens that sidebar', [width_of(P, css()), near(width('section-sidebar-panel'), 360)], [360, true]);
drag('sidebar-left-splitter', 500);
check('widths clamp to the maximum', width_of(L, css()), LIMITS[L].max);

// per surface
press('cmd-1');
check('another surface keeps its own (default) width', near(width('section-sidebar-left'), 280));
check('another surface keeps its own open state (collapsed default)', [has('section-sidebar-panel'), has('section-sidebar-right')], [false, false]);
click_test_id('toggle-sidebar-right');
check('home toggles are its own', [has('section-sidebar-right'), has('section-sidebar-panel')], [true, false]);
press('cmd-2');
// (sidebar-right is open but fitted out: 360 + 360 + 280 leaves main under MAIN_MIN at 1400px)
check('switching back restores that surface\'s width and open state', [near(width('section-sidebar-left'), LIMITS[L].max), has('section-sidebar-panel'), is_collapsed(R, css()), has('section-sidebar-right')], [true, true, false, false]);
press('cmd-1');
check('and home\'s', [has('section-sidebar-panel'), has('section-sidebar-right')], [false, true]);
press('cmd-2');

// double-click a splitter: forget the resize
const b = bounds(find_test_id('sidebar-left-splitter')!)!;
for (let i = 0; i < 2; i++) {
	step(() => native.simulateMouseDown(b[0] + 2, b[1] + 120, 0));
	step(() => native.simulateMouseUp(b[0] + 2, b[1] + 120, 0));
}
check('double-clicking a splitter resets that width', width_of(L, css()), LIMITS[L].default);

finish('panels', 24);
