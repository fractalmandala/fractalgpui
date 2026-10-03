// The src/ui primitives in isolation (test/fixtures/Gallery.svelte).
import './harness.ts';
import { set_css_vars } from 'gpuix-svelte';
import { get_native } from 'gpuix-svelte/renderer';
import { design } from '../src/kernel/design.svelte.ts';
import { all_text, bounds, check, click_test_id, drain, find, find_test_id, finish, mount_headless, settle } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import Gallery from './fixtures/Gallery.svelte';

const events: string[] = [];
load_styles();
set_css_vars(design.tokens.light);
mount_headless(Gallery, { width: 900, height: 500, props: { log: (e: string) => events.push(e) } });

const state = () => all_text().find((t: string) => /^\w \w (true|false) \d+ \d+$/.test(t));
type Mouse = { simulateMouseDown(x: number, y: number, b?: number): void; simulateMouseMove(x: number, y: number, b?: number | null): void; simulateMouseUp(x: number, y: number, b?: number): void; flush(): void };
const native = get_native() as unknown as Mouse;
const step = (f: () => void) => {
	f();
	native.flush();
	drain();
	settle();
};

check('initial state', state(), 'a x false 200 0');

const svg = find((n) => n.type === 'svg');
const box = svg && bounds(svg);
check('icon renders as a 16px svg', box ? [box[2], box[3]] : null, [16, 16]);

click_test_id('tabs-b');
click_test_id('segmented-y');
click_test_id('toggle');
click_test_id('go');
check('tabs, segmented, toggle and button update their owner', state(), 'b y true 200 1');
click_test_id('toggle');
check('toggle turns back off', state(), 'b y false 200 1');

click_test_id('close');
click_test_id('card');
check('icon button and clickable card fire', events, ['close', 'card']);

const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) <= 1; // bounds round the 1px border
check('panel starts at the bound width', near(bounds(find_test_id('panel')!)?.[2], 200));
const s = bounds(find_test_id('splitter')!)!;
const x = s[0] + s[2] / 2;
const y = s[1] + 100;
step(() => native.simulateMouseDown(x, y, 0));
step(() => native.simulateMouseMove(x + 40, y, 0));
step(() => native.simulateMouseMove(x + 90, y, 0));
check('dragging the splitter resizes live', state(), 'b y false 290 1');
step(() => native.simulateMouseUp(x + 90, y, 0));
check('release commits once', events.at(-1), 'commit 290');
check('panel follows the width', near(bounds(find_test_id('panel')!)?.[2], 290));
step(() => native.simulateMouseMove(x + 200, y, null));
check('moves after release do nothing', state(), 'b y false 290 1');

finish('ui', 10);
