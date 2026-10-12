import type { ConversationId } from '@earendil-works/pi-durable';
import type { Surface } from '../../kernel/types.ts';
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

// Agents surface: the main area shows the surface's active session tab, the
// sidebar-left is the session history, the sidebar-panel a second session.
// Tabs order = recency, surface[0] shown.
export default {
	id: 'agents',
	title: 'Agents',
	icon: 'bot',
	description: 'Agent chat sessions',
	component: Agents,
	toolbar: Toolbar,
	tabs: {
		list: () => active.surface.map((id) => ({ id, label: sessionMeta(id)?.title ?? 'Session' })),
		value: () => active.surface[0] ?? '',
		select: (id: string) => {
			void selectSession(id);
		}
	},
	sections: { 'sidebar-left': { body: SessionList }, 'sidebar-panel': { body: PanelSecondary } },
	collapsed: { 'sidebar-panel': false },
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
} satisfies Surface;
