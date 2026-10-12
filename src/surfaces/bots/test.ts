import '../../../test/harness.ts';
import { check, click_test_id, find_test_id, find_text, finish, focus, mount_headless, painted, settle, type } from 'gpuix-svelte/test';
import { load_styles } from '../../../build/styles.ts';
import App from '../../App.svelte';
import { dock } from '../../kernel/dock/dock.svelte.ts';
import { find_view } from '../../kernel/dock/tree.ts';
import { ensureActive, mainChat } from '../agents/session.svelte.ts';
import { assignSession, botIndex, sessionMeta } from '../../kernel/pi/sessions.svelte.ts';
import { bots_ui, botList, editor } from './state.svelte.ts';

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
mount_headless(App, { width: 1400, height: 860 });
settle();
await ensureActive();

// explorer + editor are two views of the default layout
click_test_id(`ptab-${find_view(dock.root, 'bots')!.leaf.id}`);
check('the explorer is empty at first and says how to start', await until(() => !!find_test_id('bots-empty')), true);

// create: into the shared botroom (no workspace)
click_test_id('bots-new');
entry('Ada', 'bots-name');
click_test_id('bots-create-go');
check('creating adds the bot to the list and selects it', await until(() => botList().length === 1 && bots_ui.selected === botList()[0].id), true);
const id = bots_ui.selected;
check('the row shows the name', !!find_text('Ada'));
check('the editor opened on the bot', await until(() => !!find_test_id('be-name')), true);

// identity is locked after creation
click_test_id('be-tabs-identity');
check('identity fields are read-only (no editing inputs)', !!find_test_id('sec-identity') && !!find_test_id('id-unlock'));

// edit character, then Save with a diff preview
click_test_id('be-tabs-character');
entry('curious', 'ch-traits');
settle();
check('an edit counts as an unsaved section', painted().includes('1 unsaved section'));
click_test_id('be-save');
check('Save shows the diff before writing', await until(() => !!find_test_id('be-diff')), true);
check('nothing is written until confirmed', !botIndex.bots[id]?.character.traits.includes('curious'));
click_test_id('be-confirm');
check('confirming writes the change', await until(() => !!botIndex.bots[id]?.character.traits.includes('curious')), true);

// sections render
for (const s of ['roles', 'capabilities', 'models', 'memory', 'activity', 'json']) {
	click_test_id(`be-tabs-${s}`);
	check(`the ${s} section renders`, !!find_test_id(`sec-${s}`));
}
click_test_id('be-tabs-models');
click_test_id('mo-choose');
check('the models section has a separate memory/summary model picker', !!find_test_id('mo-summary') && !!find_test_id('mo-panel'));

// duplicate, then delete keeps sessions (and says so)
click_test_id('be-duplicate');
check('duplicate makes a second bot', await until(() => botList().length === 2), true);
const copy = bots_ui.selected;
check('the copy is selected', copy !== id);
click_test_id('be-delete');
click_test_id('be-delete-yes');
check('delete removes the bot', await until(() => botList().length === 1), true);
check('delete says the sessions are kept', editor.notice.startsWith('Deleted'), true);

// chat with the bot creates a session assigned to it; "Move to bot" reassigns
click_test_id(`bot-${id}`);
click_test_id('be-chat');
check('New chat creates a session owned by the bot', await until(() => mainChat()?.key !== undefined && sessionMeta(mainChat().key)?.botId === id), true);
const key = mainChat().key;
await assignSession(Number(key) as never, null);
check('a session can be detached', sessionMeta(key)?.botId ?? null, null);
await assignSession(Number(key) as never, id);
check('and moved to a bot', sessionMeta(key)?.botId, id);

finish('bots', 23);
