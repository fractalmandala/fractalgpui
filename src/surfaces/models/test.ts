import '../../../test/harness.ts';
import { check, click_test_id, find_test_id, finish, focus, mount_headless, painted, settle, type } from 'gpuix-svelte/test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { load_styles } from '../../../build/styles.ts';
import App from '../../App.svelte';
import { dock } from '../../kernel/dock/dock.svelte.ts';
import { find_view } from '../../kernel/dock/tree.ts';
import { open_view } from '../../kernel/dock/dock.svelte.ts';
import { keysFolder } from '../../kernel/pi/models.ts';
import { ensureActive } from '../agents/session.svelte.ts';

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
const entry = (text: string, id: string) => {
	const n = find_test_id(id);
	if (n) focus(n);
	type(text.split('').join(' '));
};

load_styles();
mount_headless(App, { width: 1400, height: 900 });
settle();
await ensureActive();

open_view('models');
check('the Models & providers view opens as a pane', !!find_view(dock.root, 'models') && (await until(() => !!find_test_id('surface-models'))), true);
check('kept models section is there with the picker rule', !!find_test_id('md-default'), true);
check('the usage panel is there and says no limits yet checked', painted().includes('Window limits are shown only where'), true);

// provider detail: key as an owner-only file
click_test_id('md-open-faux');
check('opening a provider shows its detail', await until(() => !!find_test_id('md-detail-faux')), true);
entry('test-key-1234', 'md-key-faux');
click_test_id('md-key-save-faux');
check('saving a key shows a success line', await until(() => (painted().includes('Key saved to'))), true);
const file = join(keysFolder(), 'faux.key');
check('the key is a file under <home>/keys', existsSync(file) && readFileSync(file, 'utf8').trim() === 'test-key-1234', true);
check('the key file is mode 0600', (statSync(file).mode & 0o777).toString(8), '600');
check('the list shows it masked, not the key', painted().includes('••••1234') && !painted().includes('test-key-1234'), true);

// env reference
const envIn = find_test_id('md-env-name-faux');
if (envIn) focus(envIn);
type('F A U X _ T E S T _ K E Y');
click_test_id('md-env-use-faux');
check('using a variable says nothing was copied', await until(() => painted().includes('Nothing was copied')), true);
check('the key file now only references the variable', readFileSync(file, 'utf8').trim(), 'env:FAUX_TEST_KEY');
click_test_id('md-key-remove-faux');
check('removing the key deletes the file', await until(() => !existsSync(file)), true);

// search + keep
check('the model search is present', !!find_test_id('md-search-faux'), true);
click_test_id('md-keep-faux-faux-1');
check('keeping a model confirms it', await until(() => painted().includes('Kept faux-1')), true);

// limits: faux exposes none, so it says unavailable instead of inventing numbers
click_test_id('md-limits');
check('window limits say unavailable with a reason', await until(() => !!find_test_id('md-window-unavailable')), true);

// add by link + key (custom endpoint), manual model, then it is listed and kept
click_test_id('md-add');
check('the add-provider modal opens', await until(() => !!find_test_id('md-add-provider')), true);
click_test_id('md-add-provider-custom');
entry('Acme', 'md-add-provider-name');
entry('https://acme.example.com/v1', 'md-add-provider-base');
entry('acme-1', 'md-add-provider-manual');
click_test_id('md-add-provider-manual-add');
click_test_id('md-add-provider-save');
check('the endpoint appears among the providers', await until(() => !!find_test_id('md-provider-custom-acme')), true);
check('its chosen model was kept', await until(() => !!find_test_id('md-kept-custom-acme-acme-1')), true);

finish('models', 17);
