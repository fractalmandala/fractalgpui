/**
 * Cross-surface panel requests: the `model.choose` / `thinking.choose`
 * commands (and ⇧⌘T) name a session; its Composer opens the panel and clears
 * the request. Mutable `.item`, like `uiReady` — never reassigned.
 */
export const panelRequest = $state<{ item: { chat: string; which: 'model' | 'thinking' } | null }>({ item: null });

export function requestPanel(chat: string, which: 'model' | 'thinking') {
	panelRequest.item = { chat, which };
}

/** Rename a session from the palette: its Transcript opens the title editor. */
export const renameRequest = $state<{ chat: string | null }>({ chat: null });

export function requestRename(chat: string) {
	renameRequest.chat = chat;
}

/** Delete from the palette goes through the history's inline confirm (§1.12). */
export const deleteAsk = $state<{ id: string | null }>({ id: null });

export function requestDelete(id: string) {
	deleteAsk.id = id;
}
