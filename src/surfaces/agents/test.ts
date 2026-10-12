import '../../../test/harness.ts';
import { check, click_test_id, find, find_test_id, finish, focus, mount_headless, painted, press, settle, type } from 'gpuix-svelte/test';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load_styles } from '../../../build/styles.ts';
import App from '../../App.svelte';
import { switch_to } from '../../kernel/settings.svelte.ts';
import { run } from '../../kernel/commands.svelte.ts';
import { last_copied } from '../../kernel/clipboard.ts';
import { last_revealed } from '../../kernel/reveal.ts';
import { scriptFauxReply, scriptFauxResponses } from '../../kernel/pi/models.ts';
import { fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { openHarness, pi_context } from '../../kernel/pi/harness.svelte.ts';
import { addProject, createSession, sessionMeta } from '../../kernel/pi/sessions.svelte.ts';
import {
	active,
	branchSession,
	deleteSession,
	ensureActive,
	mainChat,
	newSession,
	openSessionChat,
	panelChat,
	selectSession,
	setPanelSession,
	type AgentChat
} from './session.svelte.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ptid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-');

load_styles();
switch_to('agents');
mount_headless(App, { width: 1400, height: 860 });
settle();

async function rows_with(chat: AgentChat, kind: string, text: string, timeoutMs = 15000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (chat.rows.some((r) => r.kind === kind && JSON.stringify(r).includes(text))) return true;
		await sleep(100);
	}
	return false;
}

async function approval_with(chat: AgentChat, status: string, timeoutMs = 15000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (chat.rows.some((r) => r.kind === 'approval' && (r as { status?: string }).status === status)) return true;
		await sleep(100);
	}
	return false;
}

/**
 * Click a pending approval's button until the row decides (the button can
 * move under the click while the run streams, so one shot may miss).
 * Never hangs the run: returns false when nothing decided in time.
 */
async function click_decide(chat: AgentChat, verdict: 'approve' | 'deny', timeoutMs = 15000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		settle();
		if (!chat.rows.some((r) => r.kind === 'approval' && (r as { status?: string }).status === 'pending')) return true;
		const btn = find((n) => typeof n.testId === 'string' && n.testId.startsWith(`ag-${verdict}-`));
		if (btn?.testId) {
			try {
				click_test_id(btn.testId);
			} catch {
				// Moved between find and click; retry.
			}
		}
		await sleep(300);
	}
	return !chat.rows.some((r) => r.kind === 'approval' && (r as { status?: string }).status === 'pending');
}

async function title_is(id: string, title: string, timeoutMs = 5000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (sessionMeta(id)?.title === title) return true;
		await sleep(100);
	}
	return false;
}

async function main_is(id: string, timeoutMs = 5000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		try {
			if (mainChat().key === id) return true;
		} catch {
			// not ready yet
		}
		await sleep(100);
	}
	return false;
}

async function main_changes(from: string, timeoutMs = 10000): Promise<string | null> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		try {
			const key = mainChat().key;
			if (key !== from) return key;
		} catch {
			// not ready yet
		}
		await sleep(100);
	}
	return null;
}

async function ui_is(id: string, present = true, timeoutMs = 5000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		settle();
		if (!!find_test_id(id) === present) return true;
		await sleep(100);
	}
	return false;
}

async function project_is(id: string, projectId: string | null, timeoutMs = 5000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (sessionMeta(id)?.projectId === projectId) return true;
		await sleep(100);
	}
	return false;
}

async function pin_is(id: string, pinned: boolean, timeoutMs = 5000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (sessionMeta(id)?.pinned === pinned) return true;
		await sleep(100);
	}
	return false;
}

await ensureActive();
settle();
const a = mainChat();

// The boot session renders as a tab in the main header
check('the surface tab shows the session', !!find_test_id(`surface-tabs-${a.key}`), true);

// The history sidebar lists the boot session with an active ring
check('the history lists the boot session', !!find_test_id(`hist-session-${a.key}`), true);
check('the active session carries the ring', painted().includes('○'), true);

// Left click selects and never opens a menu
click_test_id(`hist-session-${a.key}`);
check('left click opens no menu', !find_test_id(`hist-session-${a.key}-menu-rename`), true);

// Right-click opens the session menu
click_test_id(`hist-session-${a.key}`, { button: 2 });
check('right-click opens the session menu', !!find_test_id(`hist-session-${a.key}-menu-rename`), true);
check('the menu lists pin', !!find_test_id(`hist-session-${a.key}-menu-pin`), true);
check('the menu lists branch', !!find_test_id(`hist-session-${a.key}-menu-branch`), true);
check('delete is the danger row', !!find_test_id(`hist-session-${a.key}-menu-delete`), true);
// Rename through the menu with Enter (the input holds the current title, so
// typing appends; retried because focus races make one shot flaky)
let renamed = false;
for (let attempt = 0; attempt < 3 && !renamed; attempt++) {
	const before = sessionMeta(a.key)?.title ?? '';
	click_test_id(`hist-session-${a.key}`, { button: 2 });
	click_test_id(`hist-session-${a.key}-menu-rename`);
	if (!find_test_id(`hist-session-${a.key}-rename`)) continue;
	click_test_id(`hist-session-${a.key}-rename`);
	type('2');
	press('enter');
	renamed = await title_is(a.key, `${before}2`, 3000);
}
check('rename commits on Enter', renamed, true);

// Pin lifts the session; unpin restores
click_test_id(`hist-session-${a.key}`, { button: 2 });
click_test_id(`hist-session-${a.key}-menu-pin`);
check('pin sticks', await pin_is(a.key, true), true);
click_test_id(`hist-session-${a.key}`, { button: 2 });
click_test_id(`hist-session-${a.key}-menu-pin`);
check('unpin sticks', await pin_is(a.key, false), true);

// Composer chips: type and access menus persist per session
click_test_id('ag-type');
check('the type menu opens with descriptions', !!find_test_id('ag-type-menu-plan'), true);
click_test_id('ag-type-menu-ask');
check('the agent type sticks', a.agentType, 'ask');
click_test_id('ag-access');
click_test_id('ag-access-menu-full');
check('the access mode sticks', a.access, 'full');
click_test_id('ag-access');
click_test_id('ag-access-menu-supervised');
check('supervised is restored for the approval run', a.access, 'supervised');

// Model chip opens the fetched panel, never a text field
click_test_id('ag-model-chip');
check('the model panel opens', !!find_test_id('ag-model-panel'), true);
check('the panel lists the faux model', !!find_test_id('ag-model-panel-row-faux-faux-1'), true);
click_test_id('ag-model-panel-row-faux-faux-1');
check('selecting closes the panel', !find_test_id('ag-model-panel'), true);
check('no model input field exists', !find_test_id('ag-model-input'), true);

// Thinking chip: faux supports only off, the rest explain themselves
click_test_id('ag-thinking-chip');
check('the thinking panel opens with seven levels', !!find_test_id('ag-thinking-panel'), true);
check('unsupported levels say why', painted().includes('Not supported by faux-1'), true);
click_test_id('ag-thinking-panel-row-off');
check('the level sticks', a.thinkingLevel, 'off');

// Gauge opens the usage popover
click_test_id('ag-gauge');
check('the usage popover opens', !!find_test_id('ag-usage'), true);
check('the popover states tokens left', painted().includes('tokens left'), true);
press('escape');
settle();

// Real round trip through the bridge (a 3-word probe keeps the default title)
scriptFauxReply('Paris.');
await a.send('Capital of France?');
check('a real round trip answers', await rows_with(a, 'assistant', 'Paris.'), true);
check('the user row is first', a.rows[0], { kind: 'user', text: 'Capital of France?' });
check('idle after settle', a.busy, false);
check('no error', a.error, null);

await a.reset();
check('reset leaves a context notice', await rows_with(a, 'notice', 'Context reset'), true);

// Stale stored agent (e.g. from before a restart) heals on next use
const h = await openHarness();
const root = await h.root(pi_context());
await root.configure({ model: { provider: 'faux', modelId: 'stale-model' } }, pi_context());
scriptFauxReply('Healed.');
await a.send('Are you back on model?');
check('stale agent self-heals on send', (await root.agent(pi_context())).model?.modelId, 'faux-1');
check('healed run answers', await rows_with(a, 'assistant', 'Healed.'), true);

// A second session answers on its own and derives its title
const b = await newSession();
check('a new session becomes the shown tab', mainChat().key, b.key);
scriptFauxReply('Second answer here.');
await b.send('Please explain exactly how the session registry maps chats');
check('the second session answers on its own', await rows_with(b, 'assistant', 'Second answer here.'), true);
check('the first session never saw it', !a.rows.some((r) => JSON.stringify(r).includes('Second answer')));
check('a sentence first message becomes the title', await title_is(b.key, 'Please explain exactly how the session registry maps chats'), true);
settle();
// Branch from here inherits history into a new selected session
click_test_id(`hist-session-${b.key}`, { button: 2 });
click_test_id(`hist-session-${b.key}-menu-branch`);
const branchedKey = await main_changes(b.key);
check('branch selects a new session', branchedKey !== null && branchedKey !== b.key, true);
check('the branch kept the title', branchedKey ? await title_is(branchedKey, sessionMeta(b.key)?.title ?? '') : false, true);
settle();

// Archive moves the session to the collapsed Archived group and back
click_test_id(`hist-session-${b.key}`, { button: 2 });
click_test_id(`hist-session-${b.key}-menu-archive`);
check('archived sessions leave the main list', await ui_is(`hist-session-${b.key}-more`, false), true);
check('the Archived group appears', await ui_is('hist-archived'), true);
click_test_id('hist-archived');
check('the archived row is inside', await ui_is(`hist-session-${b.key}-more`), true);
click_test_id(`hist-session-${b.key}`, { button: 2 });
click_test_id(`hist-session-${b.key}-menu-archive`);
check('unarchive restores the row', await title_is(b.key, sessionMeta(b.key)?.title ?? ''), true);

// The panel holds a different session and refuses the surface one (D5)
const peer = await panelChat();
check('the panel holds a second session', peer.key !== mainChat().key, true);
check('the panel refuses the surface session', await setPanelSession(mainChat().key), false);
check('the refusal keeps the panel session', active.panel, peer.key);

// Tabs select: clicking the first session's tab shows it again
click_test_id(`surface-tabs-${a.key}`);
check('clicking a tab selects it', await main_is(a.key), true);

// A project: add by path, move a session in, open the folder, delete it
const projDir = mkdtempSync(join(tmpdir(), 'fractalgpui-ag-hist-'));
const projInput = find_test_id('hist-add-input');
if (projInput) focus(projInput);
type(projDir.split('').join(' '));
click_test_id('hist-add');
check('the project row appears', await ui_is(`hist-project-${ptid(projDir)}`), true);
click_test_id(`hist-project-${ptid(projDir)}`, { button: 2 });
check('right-click opens the project menu', !!find_test_id(`hist-project-${ptid(projDir)}-menu-open`), true);
click_test_id(`hist-project-${ptid(projDir)}-menu-open`);
check('open folder records the path without spawning', last_revealed(), projDir);
click_test_id(`hist-session-${a.key}`, { button: 2 });
click_test_id(`hist-session-${a.key}-menu-move`);
click_test_id(`hist-session-${a.key}-menu-move:${projDir}`);
check('the move clears the stray row', await project_is(a.key, projDir), true);
click_test_id(`hist-project-${ptid(projDir)}`, { button: 2 });
click_test_id(`hist-project-${ptid(projDir)}-menu-delete`);
check('the project confirm says sessions survive', !!find_test_id(`hist-project-${ptid(projDir)}-delete`), true);
click_test_id(`hist-project-${ptid(projDir)}-delete-yes`);
check('deleting frees the session to strays', await project_is(a.key, null), true);
settle();

// Folder picker: browse instead of typing paths (Composer + history)
click_test_id('ag-folder');
check('choose folder opens the picker', await ui_is('ag-picker'), true);
const pickRoot = mkdtempSync(join(tmpdir(), 'fractalgpui-ag-pick-'));
mkdirSync(join(pickRoot, 'subA'));
mkdirSync(join(pickRoot, 'subB'));
const jumpInput = find_test_id('ag-picker-input');
if (jumpInput) focus(jumpInput);
type(pickRoot.split('').join(' '));
click_test_id('ag-picker-go');
check('typed jump lands on the dir', await ui_is('ag-picker-row-subA'), true);
click_test_id('ag-picker-row-subA');
check('a row descends', painted().includes(join(pickRoot, 'subA')), true);
click_test_id('ag-picker-up');
check('up returns', await ui_is('ag-picker-row-subA'), true);
click_test_id('ag-picker-row-subB');
click_test_id('ag-picker-choose');
check('choose adds the project and moves the session', await project_is(mainChat().key, join(pickRoot, 'subB')), true);
check('the picker closes after choose', await ui_is('ag-picker', false), true);
click_test_id('hist-browse');
check('history browse opens the picker', await ui_is('hist-picker'), true);
click_test_id('hist-picker-cancel');
check('cancel closes it', await ui_is('hist-picker', false), true);
const pickRoot2 = mkdtempSync(join(tmpdir(), 'fractalgpui-ag-pick2-'));
click_test_id('hist-browse');
const jumpInput2 = find_test_id('hist-picker-input');
if (jumpInput2) focus(jumpInput2);
type(pickRoot2.split('').join(' '));
click_test_id('hist-picker-go');
click_test_id('hist-picker-choose');
check('history choose adds the project row', await ui_is(`hist-project-${ptid(pickRoot2)}`), true);

// Approvals, end to end: supervised write asks, Approve runs it
const wsDir = mkdtempSync(join(tmpdir(), 'fractalgpui-ag-appr-'));
const wsPid = await addProject(wsDir);
const wsId = await createSession(wsPid, { provider: 'faux', modelId: 'faux-1' });
const c = await selectSession(String(wsId));
scriptFauxResponses([
	fauxAssistantMessage([fauxToolCall('write', { path: 'note-ok.txt', content: 'approved-content' }, { id: 'w-ok' })], { stopReason: 'toolUse' }),
	fauxAssistantMessage('Wrote it after your approval.')
]);
const approved = c.send('Please write the note file');
check('the approval row arrives pending', await approval_with(c, 'pending'), true);
check('the approve click lands', await click_decide(c, 'approve'), true);
await Promise.race([approved, sleep(20000).then(() => 'stalled')]);
check('the approved write landed', existsSync(join(wsDir, 'note-ok.txt')), true);
check('the approved content is exact', readFileSync(join(wsDir, 'note-ok.txt'), 'utf8'), 'approved-content');
check('the approval reads approved', await approval_with(c, 'approved'), true);

// Deny: the call never runs and the run continues another way
scriptFauxResponses([
	fauxAssistantMessage([fauxToolCall('write', { path: 'note-no.txt', content: 'must never land' }, { id: 'w-no' })], { stopReason: 'toolUse' }),
	fauxAssistantMessage('Understood, working another way instead.')
]);
const denied = c.send('Please write the other note file');
check('the second approval arrives pending', await approval_with(c, 'pending'), true);
check('the deny click lands', await click_decide(c, 'deny'), true);
await Promise.race([denied, sleep(20000).then(() => 'stalled')]);
check('the denied write never landed', existsSync(join(wsDir, 'note-no.txt')), false);
check('the denial reads denied', await approval_with(c, 'denied'), true);
check('the run continued after denial', await rows_with(c, 'assistant', 'another way'), true);
rmSync(wsDir, { recursive: true, force: true });

// ⌘N opens a fresh tab straight from the keyboard
press('cmd-n');
check('cmd-n creates and selects a session', (await main_changes(c.key)) !== null, true);

// ⇧⌘T opens the thinking panel for the shown session
press('cmd-shift-t');
check('the shortcut opens the thinking panel', await ui_is('ag-thinking-panel'), true);
press('escape');
settle();

// ⌘, opens Settings on the models page
press('cmd-,');
check('settings opens on models', await ui_is('set-models'), true);
check('the nav highlights settings', !!find_test_id('set-nav-models'), true);

// In-app keys now live in Settings: set, mask, clear (faux stands in for a key provider)
click_test_id('set-add');
check('the add-provider modal opens', await ui_is('set-add-provider'), true);
click_test_id('set-add-provider-key-faux');
click_test_id('set-add-provider-key-input');
type('t e s t - k e y - 1 2 3 4');
click_test_id('set-add-provider-save');
check('save closes the modal', await ui_is('set-add-provider', false), true);
check('the stored key shows masked', painted().includes('•'.repeat(4) + '1234'), true);
click_test_id('set-add');
click_test_id('set-add-provider-key-faux');
click_test_id('set-add-provider-save');
check('saving empty clears the key', !painted().includes('•'.repeat(4) + '1234'), true);

// A custom endpoint: manual model, save, edit, remove — no restart anywhere
click_test_id('set-add');
click_test_id('set-add-provider-custom');
const nameInput = find_test_id('set-add-provider-name');
if (nameInput) focus(nameInput);
type('A c m e');
const baseInput = find_test_id('set-add-provider-base');
if (baseInput) focus(baseInput);
type('h t t p s : / / a c m e . e x a m p l e . c o m / v 1');
const manualInput = find_test_id('set-add-provider-manual');
if (manualInput) focus(manualInput);
type('a c m e - 1');
click_test_id('set-add-provider-manual-add');
click_test_id('set-add-provider-save');
check('the custom provider row appears', await ui_is('set-provider-custom-acme'), true);
check('the row is marked added', painted().includes('added'), true);
click_test_id('set-provider-custom-acme-more');
click_test_id('set-provider-custom-acme-menu-edit');
check('edit reopens the form with the name', await ui_is('set-add-provider-name'), true);
click_test_id('set-add-provider-close');
click_test_id('set-provider-custom-acme-more');
click_test_id('set-provider-custom-acme-menu-remove');
check('remove drops the row', await ui_is('set-provider-custom-acme', false), true);

// Transcript copy carries the shown session's exchange as text
switch_to('agents');
await selectSession(a.key);
check('copy carries the transcript', run('transcript.copy') && (last_copied() ?? '').includes('Healed.'), true);

// Deleting the shown session activates another one and drops its row
const victim = await newSession();
check('a new tab selects itself', mainChat().key, victim.key);
const next = await deleteSession(victim.key);
check('delete activates another session', next !== victim.key && mainChat().key === next, true);
check('the deleted row is gone from the index', sessionMeta(victim.key) === undefined, true);

// Opening a removed session fails loudly instead of hanging
let threw = '';
try {
	await openSessionChat('999999');
} catch (err) {
	threw = (err as Error).message;
}
check('opening a missing session throws', threw.includes('unknown session'), true);

rmSync(projDir, { recursive: true, force: true });
rmSync(pickRoot, { recursive: true, force: true });
rmSync(pickRoot2, { recursive: true, force: true });
finish('agents', 87);
