// Regression: the Models & providers view used to render every provider and froze when scrolled with a real
// catalog (40+ providers, 1500+ models). With a big catalog it must render a bounded number of rows and stay quick.
import './harness.ts';
import { check, find_all, find_test_id, finish, mount_headless, settle } from 'gpuix-svelte/test';
import { load_styles } from '../build/styles.ts';
import App from '../src/App.svelte';
import { open_view } from '../src/kernel/dock/dock.svelte.ts';
import { piModels } from '../src/kernel/pi/harness.svelte.ts';
import { models_ui } from '../src/surfaces/models/state.svelte.ts';
import { saveCustomProvider } from '../src/kernel/pi/models.ts';
import { ensureActive } from '../src/surfaces/agents/session.svelte.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 8000) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		settle();
		if (cond()) return true;
		await sleep(40);
	}
	return cond();
}
const rows = (prefix: string) => find_all((n) => typeof n.testId === 'string' && n.testId.startsWith(prefix)).length;

const PROVIDERS = 400;
const MODELS = 20;
for (let i = 0; i < PROVIDERS; i++) {
	saveCustomProvider(piModels(), {
		id: `scale-${i}`,
		name: `Scale ${i}`,
		baseUrl: `https://scale${i}.example.com/v1`,
		api: 'openai-completions',
		modelIds: Array.from({ length: i === PROVIDERS - 1 ? 1500 : MODELS }, (_, k) => `m-${i}-${k}`)
	});
}

load_styles();
mount_headless(App, { width: 1400, height: 900 });
settle();
await ensureActive();

const t0 = performance.now();
open_view('models');
check('the view opens with a big catalog', await until(() => !!find_test_id('surface-models')), true);
const openMs = performance.now() - t0;
check(`opening is quick (${Math.round(openMs)}ms)`, openMs < 3000, true);
check('provider rows are capped, not one per provider', rows('md-open-') <= 40 && rows('md-open-') > 0, true);
check('the list says how many more there are', !!find_test_id('md-providers-more'), true);

models_ui.providerLimit += 30; // the button sits far below the 538px headless viewport
check('show more adds a bounded page', await until(() => rows('md-open-') > 40), true);
check('still bounded after show more', rows('md-open-') <= 120, true);

// search narrows the providers
const s = find_test_id('md-provider-search');
check('there is a provider search', !!s, true);
models_ui.providerSearch = '399'; // the input is below the headless viewport; the state is what the input sets
check('searching narrows the list', await until(() => rows('md-open-') === 1), true);

models_ui.open = 'scale-399'; // same state the row click sets (the row is below the headless viewport)
check('a provider with 1500 models opens', await until(() => !!find_test_id('md-detail-scale-399')), true);
check('its model rows are capped', rows('md-model-scale-399-') <= 40 && rows('md-model-scale-399-') > 0, true);

finish('models-scale', 10);
