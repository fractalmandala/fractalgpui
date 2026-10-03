// Shell regions: collapse (keys, buttons, rail), resize by dragging, per-surface widths.
import './harness.ts';
import { get_native } from 'gpuix-svelte/renderer';
import { bounds, check, click_test_id, drain, find_test_id, finish, mount_headless, press, settle } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { is_collapsed, LIMITS, width_of } from '../src/kernel/layout.svelte.ts';
import { switch_to } from '../src/kernel/settings.svelte.ts';

type Mouse = {
	simulateMouseDown(x: number, y: number, b?: number): void;
	simulateMouseMove(x: number, y: number, b?: number | null): void;
	simulateMouseUp(x: number, y: number, b?: number): void;
	flush(): void;
};

load_styles();
switch_to('css-to-sass');
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

check('all three panels open on a wide window', [has('left-sidebar'), has('agent-panel'), has('inspector-panel')], [true, true, true]);
check('panels start at their default widths', [near(width('left-sidebar'), 240), near(width('agent-panel'), 340), near(width('inspector-panel'), 300)], [true, true, true]);
check('the inspector shows the surface body', has('opt-nest') && has('opt-comments-loud'));

// collapse
press('cmd-b');
check('⌘B collapses the left sidebar to the icon rail', [has('left-sidebar'), has('left-rail'), near(width('left-rail'), 52)], [false, true, true]);
click_test_id('left-expand');
check('the rail expands it again', has('left-sidebar') && !has('left-rail'));
click_test_id('left-collapse');
check('the header button collapses it', has('left-rail'));
press('cmd-b');

press('cmd-j');
check('⌘J closes the agent panel', !has('agent-panel') && is_collapsed('agent'));
click_test_id('toggle-agent');
check('the title-bar button reopens it', has('agent-panel'));
click_test_id('agent-close');
check('its close button closes it', !has('agent-panel'));
press('cmd-j');

press('cmd-i');
check('⌘I closes the inspector', !has('inspector-panel'));
press('cmd-i');
press('cmd-\\');
check('⌘\\ closes every panel', [has('left-sidebar'), has('left-rail'), has('agent-panel'), has('inspector-panel')], [false, true, false, false]);
press('cmd-\\');
check('⌘\\ again opens them all', [has('left-sidebar'), has('agent-panel'), has('inspector-panel')], [true, true, true]);

// resize
drag('left-splitter', 60);
check('dragging the left splitter widens the sidebar', [width_of('left', 'css-to-sass'), near(width('left-sidebar'), 300)], [300, true]);
drag('agent-splitter', -80);
check('dragging a right splitter leftwards widens that panel', [width_of('agent', 'css-to-sass'), near(width('agent-panel'), 420)], [420, true]);
drag('left-splitter', 500);
check('widths clamp to the maximum', width_of('left', 'css-to-sass'), LIMITS.left.max);

// per surface
press('cmd-1');
check('another surface keeps its own (default) width', near(width('left-sidebar'), 240));
check('home has no agent or inspector, and no toggles for them', [has('agent-panel'), has('inspector-panel'), has('toggle-agent'), has('toggle-inspector')], [false, false, false, false]);
press('cmd-2');
check('switching back restores the resized width', near(width('left-sidebar'), LIMITS.left.max));


// double-click a splitter: forget the resize
const b = bounds(find_test_id('left-splitter')!)!;
for (let i = 0; i < 2; i++) {
	step(() => native.simulateMouseDown(b[0] + 2, b[1] + 120, 0));
	step(() => native.simulateMouseUp(b[0] + 2, b[1] + 120, 0));
}
check('double-clicking a splitter resets that width', width_of('left', 'css-to-sass'), LIMITS.left.default);

finish('panels', 19);
