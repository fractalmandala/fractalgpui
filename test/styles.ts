// The strict style check: every class the app uses exists, and nothing it relies on
// was dropped on the way to GPUI (beyond the allow-list in build/allow.ts).
import './harness.ts';
import { check, finish } from 'gpuix-svelte/test';
import { build_styles, style_problems } from '../build/styles.ts';

const build = build_styles();
const problems = style_problems(build);
for (const p of problems) console.log(`  problem: ${p}`);

check('fractalstyler compiled', build.fractalstyler.sheets.length > 0);
check('app uses classes', build.used.size > 30);
check('rules registered after pruning', build.registered > 30);
check('no unknown classes and no unexpected losses', problems, []);

const { light, dark } = build.tokens;
check('space-sm flattened to px', dark['space-sm'], '8px');
check('text-lg flattened to px', dark['text-lg'], '20px');
check('dark and light differ on --bg', light.bg !== dark.bg && !!light.bg && !!dark.bg);
check('app token --font-mono present', dark['font-mono'], 'Menlo');
check('own classes all translated', ['wb-btn', 'wb-rail', 'wb-palette', 'wb-scrim'].every((c) => build.defined.has(c)));

finish('styles', 9);
