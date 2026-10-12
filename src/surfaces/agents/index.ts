import type { ConversationId } from '@earendil-works/pi-durable';
import type { View } from '../../kernel/types.ts';
import Agents from './Agents.svelte';
import PanelSecondary from './PanelSecondary.svelte';
import SessionList from './SessionList.svelte';
import Toolbar from './Toolbar.svelte';
import { copy_text } from '../../kernel/clipboard.ts';
import { flash } from '../../kernel/status.svelte.ts';
import { transcriptText } from '../../kernel/pi/project.ts';
import { sessionMeta, setSessionArchived } from '../../kernel/pi/sessions.svelte.ts';
import { active, deleteSession, mainChat, newSession, selectSession } from './session.svelte.ts';
import { requestDelete, requestPanel, requestRename } from './panels.svelte.ts';

// Agents views: the session history, the chat for the active session (its open sessions are
// tabs inside the view), and a side chat holding a second session.
const sessions = {
	id: 'sessions',
	title: 'Chats',
	icon: 'history',
	description: 'Bots and their chats, plus plain sessions',
	component: SessionList
} satisfies View;

const chat = {
	id: 'chat',
	title: 'Chat',
	icon: 'message-square',
	description: 'The active agent session',
	component: Agents,
	toolbar: Toolbar,
	commands: [
		{ id: 'agents.stop', title: 'Stop this run', run: () => mainChat().stop() },
		{ id: 'agents.reset', title: 'Reset this session', run: () => mainChat().reset() },
		{ id: 'session.new', title: 'New session', group: 'Session', keys: 'cmd-n', run: () => void newSession() },
		{ id: 'session.rename', title: 'Rename session', group: 'Session', run: () => requestRename(mainChat().key) },
		{ id: 'session.delete', title: 'Delete session', group: 'Session', run: () => requestDelete(mainChat().key) },
		{
			id: 'session.archive.toggle',
			title: 'Toggle archived sessions',
			group: 'Session',
			run: () => {
				const id = mainChat().key;
				const meta = sessionMeta(id);
				if (meta) void setSessionArchived(Number(id) as ConversationId, !meta.archived);
			}
		},
		{ id: 'model.choose', title: 'Model: choose…', group: 'Session', run: () => requestPanel(mainChat().key, 'model') },
		{ id: 'thinking.choose', title: 'Thinking level: choose…', group: 'Session', keys: 'cmd-shift-t', run: () => requestPanel(mainChat().key, 'thinking') },
		{
			id: 'transcript.copy',
			title: 'Transcript: copy',
			group: 'Session',
			run: () => {
				if (copy_text(transcriptText(mainChat().rows))) flash('Transcript copied', 'success');
				else flash('Copy failed', 'danger');
			}
		}
	]
} satisfies View;

const side = {
	id: 'chat-side',
	title: 'Side chat',
	icon: 'bot',
	description: 'A second session beside the first',
	component: PanelSecondary
} satisfies View;

// Order matters: the chat and the sessions list are ⌘1 and ⌘2 (see surfaces/index.ts for the rest).
export default [chat, sessions, side] satisfies View[];
