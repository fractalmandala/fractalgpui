# PRODUCT.md — the agent workbench

Desired behavior for the **agent surface**, its **tooling**, and the **workbench UI** around it,
consolidated from the reference set in `assets/ui-reference/` (13 screenshots) and the
recalibration request of 2026-10-05.

**Status: not implemented.** Everything below describes intended behavior; the code today
implements only what each section's "Today" line says.

See `TECH.md` for the implementation plan and how each invariant is verified. Open questions are
marked inline and collected at the end; they are decisions, not details.

This replaces the UI plan in `docs/pi-phase1.md`. The harness wiring that document describes
(pi-durable over SQLite, the faux provider in tests, the model dropdown, the in-app key store)
stays and is extended here.

## Prerequisites

The app needs some essential features and it is time to start building them:

1. Currently, it has no right-click menus. The host renderer forwards no `contextmenu` event. Every reference context menu is opened by an explicit overflow button instead. Building context menu is prerequisite one.
2. The host exposes `setWindowTitle`, `activateWindow`, `blur` and `focusElement` — no native folder picker (proposed upstream as `remorses/gpuix#82`). Until it lands, picking a folder is an in-app dialog (`ui/FolderPicker.svelte`: breadcrumbs, subfolder list capped per F25, typed-path jump, Choose/Cancel) opened from the history **Browse** button and the composer's **Choose folder** action; "Open folder" and "Show in Finder" shell out to `open`.

Reference images, by the feature they inform:

| Image | Feature |
|---|---|
| `chat-history`, `chats-context-menu`, `project-context-menu` | §1 sessions and projects |
| `agent-type`, `agent-access`, `agent-permissions`, `session-context` (lower half) | §2 composer |
| `model-selector`, `model-selector-2` | §3 model and thinking selection |
| `session-context` (upper half) | §4 usage and context readout |
| `agent-permissions` (upper half) | §5 run progress |
| `agent-type`/`agent-access` (bottom rows), `session-context` (tool context) | §6 tool use and approvals |
| `model-configuration`, `select-default-model`, `add-provider`, `add-custom-api-provider` | §7 provider and model configuration |
| — | §8 transcript, §9 shell and settings surface |

## 1. Sessions and projects

**Summary.** The Agents surface's left sidebar becomes the app's chat history: every session the
user has ever run, grouped under the project folder it belongs to, with the operations needed to
name, order, branch, archive and delete them. Today that sidebar holds provider/model/keys/spend
controls and the app has exactly two sessions (`chat`, `chat2`), which the user can neither see
nor choose; those controls move to Settings (§7) and the two fixed sessions become a list.

**Behavior.**

1. The Agents surface's left sidebar contains exactly two groups, in this order: **Sessions**,
   then **Projects**.

2. **Sessions** lists sessions that belong to no project, newest activity first, one row each,
   title truncated to one line. When there are none, the group is not shown.

3. **Projects** lists one row per known project, most recently active first: a folder icon, the
   project's display name (default: the folder's base name), a small dot when any of its sessions
   has a run in flight, an overflow `…` button, and a `+` button. Clicking the rest of the row
   expands or collapses it; the collapsed/expanded state of each project persists across
   restarts. The `+` creates a new session inside that project.

4. Expanding a project lists its sessions under time-bucket headings in this order:
   **Today**, **Yesterday**, **Previous 14 days**, **Older**. A bucket with no sessions is not
   rendered. Within a bucket, sessions are newest activity first.

5. A session row shows its title, and is highlighted while it is the active session. Multiple sessions can be active at a time, across the whole app. Active sessions are shown carrying a leading ring glyph (`○`) before the title/

6. A session transcript shows that session's full history from
   storage, the composer binds to it, and the composer's input takes focus. A session with no
   entries shows an empty transcript, not a placeholder conversation.

7. The overflow `…` menu on a session row lists, in order: **Rename**, **Pin**, **Archive**,
   **Branch from here**, **Copy session ID**, **Copy store path**, **Delete**. Delete is the only
   row in the danger color. The menu is anchored to its `…` button, closes on Esc, on a click
   outside it, and on choosing any item.

8. **Rename** turns the row into a text input holding the current title. Enter commits, Esc
   cancels, and an empty or whitespace-only value is rejected (the title is unchanged).

9. **Pin** lifts the session above unpinned sessions inside its own list, and the item becomes
    **Unpin**. A pinned project sorts above unpinned projects the same way. Pinned state persists.

10. **Archive** removes the session from its normal place and puts it in an **Archived** group
    that renders after Projects, collapsed by default, so an archived session stays reachable.
    The item becomes **Unarchive**. Archived sessions never appear in a time bucket, and their
    project's session list excludes them.
    Collapsed archive group is the home for them.

11. **Branch from here** creates a second session that inherits the active session's history up
    to its newest entry, selects it, and leaves the source session untouched. The new session is
    a separate row with its own ID; using either one never changes the other's later entries.

12. **Delete**: the row swaps to an inline confirmation
    (`Delete this session?` / **Delete** / **Cancel**), matching the app's existing inline
    confirm on "Clear all recent?". Confirmed, the session and its entries are removed from
    storage permanently. If the deleted session was active, the newest remaining session becomes
    active; if none remain, a new empty session is created and made active.

13. Deleting a **project** (from its menu) removes the project entry only. It never deletes
    files on disk. Its sessions survive and move to the **Sessions** group, because they now
    belong to no project. The confirmation text says exactly that.

14. The project overflow menu lists, in order: **Open folder**, **Rename project**, **Pin
    project**, **Archive project**, **Delete project**, **Close**. `Open folder` reveals the
    folder in the OS file manager. `Rename project` edits the display name only, not the path.
    Archived projects move to the Archived group with their sessions hidden inside them.

15. A session belongs to at most one project. A session's project is fixed when the session is
    created (the project active at that moment).
    
16. A session may some times need to be moved - a folder moved in local drive, a context shifted to another project - then a session can be moved to new project by right click option, or by dragging it in the sidebar, and dropping in new location.  

17. **New session** (⌘N, and a **New session** action in the Sessions group header) creates a
    session in the project of the currently active session, or a project-less session when none
    is active, selects it and focuses the composer. A new session's title is `New session` until
    its first user message arrives; after that the title is that first message, truncated to one
    line.

18. New sessions derive title deterministically from the first user message that is a sentence or longer. User often sends tests messages like "hi", or "are you there?" which should not be used.


19. A project is added from an **Add project** row at the bottom of the Projects group:
   typing an absolute folder path and pressing Add, or pressing **Browse** for the
   folder dialog (breadcrumbs, subfolder list, typed-path jump, Choose). A path
   that does not exist, or that is not a directory, is rejected inline with the
   reason and nothing is added. Re-adding an existing project selects it instead
   of duplicating it. The app never moves, creates or writes into the folder
   itself. Until the host grows a native picker dialog, the dialog is drawn
   in-app; a native call replaces its backend without changing this behavior.

20. Every project row can show its live git branch when the folder is a git work tree, and
    nothing when it is not. Reading the branch never blocks the UI.

21. The history list must stay usable with hundreds of sessions: it scrolls, and the active
    session stays scrolled into view when it changes.

21. Multiple sessions can run at once ( multiple tabs in main session and in the sidebar panel).
    Each row's live dot reflects its own session's runs. Sending in one session never blocks or
    cancels the other.

## 2. Composer

**Summary.** The composer becomes the task bar the reference shows: agent type, access mode,
workspace context, a model chip, an attachment button and a send button.
Today it is a three-row textarea, a model pill, and Send/Stop.

**Behavior.**

1. The composer is docked at the bottom of the agent region on every surface that hosts it
   (the Agents surface body, and the sidebar panel on Home and Tools).

2. Its top row is a single rounded input surface holding:
   - The draft text, as a multi-line text input that grows to a small maximum and then scrolls.
     Enter submits, which is the same as send.
   Shift+Enter should insert a newline.
   - A trailing **Agent type** control (§2.3), and a **Send** button showing the `↵ Send` hint.
     While a run is in flight the Send button becomes **Stop** in the same place.

3. **Agent type** — a control labelled with the current type, opening a menu of:
   - **Plan** — `Explore and produce a plan; no changes`
   - **Build** — `Do the work; make changes`
   - **Ask** — `Answer questions; no changes`
   Each row shows its icon, name and description; the current one is checked. The menu closes on
   Esc, on a click outside, and on choosing. The chosen type applies to the runs of the session
   from then on and persists with it.

4. **Access mode** — a control labelled with the current mode, opening a menu of:
   - **Supervised** — `Ask before commands and file changes`
   - **Auto-accept edits** — `Auto-approve edits, ask before other actions`
   - **Full access** — `Allow commands and edits without prompts`
   The current one is checked. The chosen mode applies to the runs of the session from then on
   and persists with it. How a mode is enforced is §6.

5. Below the input, a context row shows, left to right: the workspace folder icon and name, the
   current git branch with a branch icon, and `N more` when the workspace holds other worktrees,
   where `N` is a real count and the row is absent when there is nothing more. When the session
   has no project, the row shows `No folder` and a **Choose folder** action that opens the
   folder dialog of §1.19.

6. An attach button (`+`) sits left of the access-mode control. Its function is unchanged scope:
   it is present only when attaching something is possible; until then it does not render, rather
   than opening an empty menu.

7. The composer keeps its draft per session: switching sessions and coming back preserves that
   session's unsent text. Drafts are not written to storage.

8. Submitting an empty or whitespace-only draft does nothing. Submitting while the session is
   already running is not allowed by the Send button (it is Stop); if a submit races a starting
   run, the app queues it rather than dropping it or erroring.

9. Errors report in the composer, in place, as one line in the danger color, showing the
    provider's or the run's own message text (no paraphrase, no generic substitute), and the line
    clears on the next send. A missing key is an error of this kind, naming the provider and how
    to set its key.

10. The composer is disabled-looking (muted, no focus) while the session it belongs to cannot run:
    no key for the selected provider, or the session is closed. It is never disabled for a run in
    flight, because Stop has to stay reachable.

11. Sending scrolls the transcript to the newest row and keeps following while the run streams,
    unless the user has scrolled away, in which case following stops until they return to the
    bottom.

## 3. Model and thinking selection

**Summary.** Model choice becomes a searchable panel grouped by provider, with each model's
capability and context size; and thinking effort becomes a first-class, per-session choice with
its own seven-step scale. Today: one flat fetched list of `name` rows behind a `Button` in the
sidebar, and no thinking level at all.

**Behavior.**

1. The session's model and thinking level are shown on a chip in the composer's row: the model's
   display name and its ID or short capability summary, plus the current thinking level. The chip
   opens the model panel; the thinking level opens the thinking panel.

2. **Model panel** — a bounded, scrolling panel with:
   - A `Search models` input at the top, focused on open. Typing filters the list below by model
     name and by provider name, case-insensitively, matching substrings in either.
   - Rows grouped under a provider heading, in the order the providers are configured in
     Settings. Each row shows the model's display name, its context window as a compact size
     (`1M`, `262.1K`, `1.05M`), and capability glyphs where they apply: an eye for image input
     and a reasoning mark for reasoning models. The current model's row carries a check mark.
   - Keyboard: ↑/↓ move the highlight, Enter selects, Esc closes, and the panel footer shows
     `N models · ↹ Navigate · ↵ Select · Esc Close` with the real `N`.
   - When nothing matches, one muted line (`No models match`) and no rows.
   - When the session's provider has no models available (no key, or a provider with no catalog),
     the panel says so instead of showing an empty list.

3. Choosing a model applies it to that session for its following runs. A model that cannot serve
   the session (its provider has no key) is still selectable, and the composer reports the missing
   key per §2.10 — the panel does not hide models the user has not configured yet, but it does
   mark the provider heading as unconfigured.

4. **Thinking panel** — a bounded, scrolling panel over the same rows, one per level, in
   cheapest-first order: **Minimal**, **Low**, **Medium**, **High**, **Xhigh**, **Max**, **Off**,
   each with a short description of what it does. The current level is checked. The footer shows
   the real count and the same keyboard hints. ⇧⌘T opens this panel directly; hovering the chip
   shows the hint `Choose Thinking Level (⌘⇧T)`.

5. Levels a model does not support are shown, dimmed, with no check box, and are not selectable;
   the reason (the model does not implement that level) is what the row says. The panel never
   silently reassigns the user's chosen level; if a level is unsupported by a newly selected
   model, the app keeps the lowest supported level that is at least as capable and reports the
   change in the transcript as an inline notice.

6. The thinking level is per session, persists with it, and is applied to the following runs of
   that session. Two sessions may hold different levels.

7. Both panels open automatically where the reference shows a hover hint (`⌘⇧T`), and both are
   also reachable from the command palette as commands (`Model: choose…`, `Thinking level:
   choose…`), with the same effect.

## 4. Usage and context readout

**Summary.** A live readout of how much context is left and what the session has spent, per the
reference: a context gauge in the composer row and a popover with the details. Today the sidebar
shows one line, `$0.00 · 0 tokens`, for the root conversation only.

**Behavior.**

1. A compact context gauge in the composer's row shows the percentage of the session's context
   window still free: a status icon whose tone reflects how much is left, with the number beside
   it. It reflects the active session and updates as the session runs.
   Arc svg graphic can be used, or canvas/shape API has to build it.

2. Clicking the gauge opens a popover with, in order:
   - `N tokens left` as a heading, and the same percentage, right-aligned.
   - `Context window`: used out of total, in tokens, with the used percentage.
   - `This turn`: the tokens the in-flight or most recent turn put into context.
   - `Generation speed`: output tokens per second for the last generation, absent until there is
     one.
   - `Provider usage`: input and output tokens, cache-read tokens, cache hit rate as a
     percentage, and reasoning tokens when the provider reports them. A figure the provider does
     not report is shown as `—`, never as `0`.
   - `Tool context`: how many distinct tools the session's runs have used, how many calls, and
     the tokens those calls cost, when anything is recorded.

3. Values come from the session's own records. Before a session has run, the popover shows the
   context window total and `0` used, with the other rows absent rather than zero-filled.

4. The popover closes on Esc, on a click outside, and on a second click on the gauge. It is
   keyboard focusable and every value is readable as text.

5. The spend figure the sidebar used to show is not lost: the popover carries it (tokens) and the
   session's cost in INR (Indian Rupee ₹) appears in the same popover as part of `Provider usage`.
   The rupee rate is fetched live from a public FX endpoint, cached with its fetch time, and the
   popover states the rate used; offline, the last cached rate stands.

## 5. Run progress

**Summary.** While a run works, the composer shows what it is doing as a checklist, per the
reference's `3/3 completed` block of green rows. Today the composer shows only `working…`.

**Behavior.**

1. When the active session's run has a step list, that list renders directly above the composer
   input, collapsed to one line: a check mark, `N/M completed`, where `N` is the number of
   completed steps. Clicking the line expands the steps; clicking again collapses it. The
   expanded/collapsed state persists for the session.

2. Expanded, each step is a row with a check mark and its text; completed rows read as done
   (check mark and a success-toned surface), the step in progress is marked as in progress, and
   steps not started are muted. Step order is the order the run declared them in.

3. The block appears only when the run has declared steps, is kept up to date as the model works, and disappears when the run ends and
   the session's next run has none. It never invents steps.

4. When the run ends, a finished list stays visible until the user sends the next prompt.

5. The block is read-only: nothing in it is clickable except the collapse/expand line.


## 6. Tool use and approvals

**Summary.** Tooling stops being invisible. The session's access mode decides what the agent may
do without asking, the transcript shows each call and its result, and approvals arrive inline.
Today the agent has no filesystem or shell access at all and no approval concept, and tool calls
are rendered as one muted row with a JSON blob.

**Behavior.**

1. Three access modes exist per session (§2.4):
   - **Supervised**: every command and every file change asks first.
   - **Auto-accept edits**: file writes and edits proceed without asking; commands and other
     actions ask first.
   - **Full access**: nothing asks.

   Reads of the workspace (listing, reading, searching) never ask in any mode.

2. When a call must ask, the transcript shows an approval row in the session's flow, at the point
   the call happened, containing: what the agent wants to do in one line (the tool and its target
   — e.g. the command text, or the file path being written), the full arguments it will use, and
   **Approve** / **Deny** buttons. The run waits: nothing past that call happens until the user
   answers.

3. Approving runs the call and records the approval in the session's history. Denying does not
   run it: the model is told the call was denied by the user, keeps the feedback in context, and
   the run continues. A denial is visible in the transcript afterwards as a denied row.

4. An approval that is never answered, and whose run is stopped, is recorded as denied at stop
   time; the transcript shows that the run was stopped while waiting.

5. Denying one call never silently denies the rest: each asking call gets its own row and its own
   answer. Two identical calls ask twice.

6. Tool rows in the transcript show, in this order: the tool's name, a one-line summary of its
   input, and — while it runs — its streaming output; when it finishes, its result. A call that
   failed (a non-zero exit, a rejected command, a missing file) renders as a failure with its
   error text, and never as a success.

7. Tool output that is long is bounded in the transcript behind an expand affordance; the
   truncation is stated with what was dropped. Nothing is clipped without saying so.

8. Every call is attributable: the transcript row and the run's tool-context figures (§4.2) come
   from the session's own records, so reloading the session reproduces them.

9. The session's file access is confined to its workspace folder: a call that resolves outside
   it is refused, and the refusal says why. With no workspace folder set (§2.5) any file or
   command call is refused with that reason.

10. The modes are a property of the session and are visible at all times in the composer, so the
    user can always tell whether the agent is currently allowed to act.

## 7. Provider and model configuration

**Summary.** A Settings surface owns model providers: the default model for new sessions, every
provider with an enable switch, and adding a provider — including a custom OpenAI-compatible
endpoint with its own model list. Today there is one segmented control of five hard-coded
providers, a plaintext key store, and no notion of a default model or an added provider.

**Behavior.**

1. **Model configuration** is a page of the Settings surface (§9). It has two blocks: **Defaults**
   and **AI providers**.

2. **Defaults** shows one row: **Default model**, with the provider name and the model ID, and a
   **Change** control. Change opens a panel listing models grouped by provider with a
   `Filter models` input at the top; choosing one makes it the default model for **new** sessions
   and closes the panel. Existing sessions keep their own model.

3. **AI providers** is headed by a count of the configured providers and an **Add provider**
   button. Each provider row shows a letter mark, the provider's name, its host or base URL, and
   its model count, plus an enable switch.

4. A provider's switch on means its models are offered in the model panel (§3.2) and in the
   default-model panel. Off means its models are hidden there. Turning a provider off never
   changes a session's already-chosen model, never deletes its key, and never deletes its cached
   model list; the session that uses it reports the situation per §2.10.

5. The list shows every provider the app knows: the ones shipped with the model runtime, and the
   ones the user added. Each row states which of these it is, and which are configured
   (have a credential) versus known but unconfigured.

6. **Add provider** opens a modal titled `Add AI provider` with a `Filter services` input and two
   sections:
   - **Connect with an API key** — every provider that takes a key, each row showing its letter
     mark, name and host. Choosing one opens the key form for that provider.
   - **Sign in with a subscription** — the providers whose authentication is an account sign-in
     rather than a key, each row naming how it signs in.

   Filtering narrows both sections by name and host. The modal closes on Esc, on Cancel and on a
   click outside; a click inside does not close it. The modal's own **Save provider** commits and
   closes; Cancel discards.

   The section that a provider appears in is decided by that provider's own authentication
   support, not by a list in this app: a provider that supports a key appears under keys; one
   that supports a sign-in flow appears under subscriptions; one that supports both appears in
   both. Choosing subscription provider starts its sign in flow.


7. **The key form** for a provider takes the key in a masked field, labelled with the environment
   variable that provider reads, and states plainly that the key is stored in this app's settings
   file and that an environment variable of that name still wins. **Save provider** stores it and
   closes; clearing the field and saving removes the stored key. A key that the app can tell is
   malformed (wrong prefix for the provider) is refused with the reason.

8. **Custom endpoint** (`Custom endpoint` under keys) opens a form with: **Name**, **Base URL**,
   **API key**, and **API format** (a dropdown; `OpenAI Chat Completions` and the other formats
   the runtime can speak). Below, two columns:
   - **Models from this service** — with a `Fetch list` action and a `Search model ID` input.
     Before a base URL is entered the column says `Enter a base URL to load models`. Fetching
     lists the models the endpoint reports; each row can be chosen. A fetch that fails reports the
     endpoint's error verbatim in the column and leaves the list empty.
   - **Model settings** — the models chosen from the left, each with its context size when the
     runtime knows it, and a `Search added models` input. With nothing chosen it says
     `No models chosen yet. Pick one from the list.` A `+ Add custom model` row takes a model ID
     by hand for endpoints that cannot list models.

9. `Advanced settings` in the modal's header opens the provider's extra fields (headers, and the
   format's own options). It is present only when the selected service actually has extra fields.

10. Adding a provider never requires a restart: after Save the provider appears in the AI
    providers list, its models appear in the panels, and it is selectable in an existing session
    immediately.

11. A custom provider's stored definition can be edited (base URL, API format, models) and
    removed from its row's own menu. Removing a provider removes its definition and its cached
    model list; it does not delete any stored key belonging to a shipped provider, and it never
    changes a session's model by itself.

12. Key state is legible per provider: configured-by-environment-variable, configured-in-app,
    and not configured are distinguishable in the list, and the source is named (the variable
    name, or `stored in this app`).

13. No secret is ever rendered in full after it is saved; the most the UI shows is a masked tail.
    Secrets are never written to logs, the transcript, or session storage.

## 8. Transcript

**Summary.** The transcript keeps its current row vocabulary and gains the reference's
presentation details: a titled session header, the workspace, and per-row affordances.

**Behavior.**

1. The transcript is the whole active session's history, oldest at the top, newest at the bottom,
   rendered from the session's records. Reopening a session reproduces it exactly, including
   across an app restart.

2. Row kinds, each visually distinct:
   - **User** — right-aligned on a raised surface.
   - **Assistant** — plain text in the primary color.
   - **Thinking** — muted, distinct from assistant text, and collapsed to a summary line that
     expands.
   - **Tool call** — §6.6.
   - **Approval** — §6.2.
   - **Code / output** — in a sunken pane with the language's highlighting and a copy action.
   - **Notice** — a centered muted line, used for context resets and compactions.

3. A run in flight streams: the assistant's partial text appends as it arrives, and the moment the
   answer commits, the partial is replaced by the committed entry with no duplicate row.

4. The transcript's header row shows the active session's title and its workspace folder, or
   `No folder`. The title is editable in place from this header, with the same rules as §1.9.

5. Every row that carries text can be selected and copied. Code rows copy their code; the whole
   transcript can be copied as text from the command palette (`Transcript: copy`).

6. Scrolling: while following, new rows keep the newest row visible; if the user scrolls up,
   following stops until they scroll back to the bottom. A `Jump to latest` affordance appears
   while following is off and there are unseen rows below.

7. A session that ends without an answer still shows what happened: the reason, and any provider
   error text verbatim, as a row, not only as a transient banner.

8. An empty session shows an empty transcript with one muted line inviting the first message.

## 9. Shell, navigation and the Settings surface

**Summary.** The app gains a Settings surface, the Agents surface gains the history sidebar of
§1, and navigation is unchanged otherwise.

**Behavior.**

1. The left nav lists four surfaces in this order: **Home**, **Tools**, **Agents**, **Settings**,
   with the Settings item showing a gear. The nav is icons only, in a row, above the sidebar body,
   and the active one is highlighted — unchanged from today.

2. The Settings surface fills the main area with its own page content and its left sidebar with
   the page list: **General**, **Agent & models**, **Shortcuts**, **About**. **Agent & models**
   holds the Model configuration page of §7. The selected page persists.

3. Settings opens on **Agent & models** when it is opened by the **Settings: model
   configuration** command, and on the last selected page otherwise.

4. **Shortcuts** lists every command that has a keystroke, grouped by area, generated from the
   command registry — not a hand-maintained table. A command with no keystroke is not listed.

5. **About** shows the app version, the storage location (with an action to reveal it), and the
   runtime version of the model library.

6. **General** holds appearance (the theme toggle that today lives in the nav row keeps working)
   and nothing else in this pass.

7. The sidebar-panel host for the agent chat is unchanged: on Home and Tools the panel carries the
   main session; on Agents the panel carries a second session and the surface carries the main
   one. Whether the panel's session is the same as the surface's is remembered.

8. The app-level commands the shell already registers keep working unchanged (`⌘K` palette,
   `⌘1…9` surfaces, `⌘B`/`⌘J`/`⌘I`/`⌘\`, `⌃⇥`, `⇧⌘L`, style diagnostics). New commands this spec
   adds: **New session** (⌘N), **Choose model**, **Choose thinking level** (⇧⌘T), **Rename
   session**, **Delete session**, **Toggle archived sessions**, **Open settings** (⌘,).

9. Every new command appears in the command palette with its group, and the palette's existing
   fuzzy matching and selection order are unchanged.

10. Nothing in this spec may regress the constraint set the shell already follows: flexbox only,
    no CSS transitions or animations (motion via the native `motion` prop), `hitbox="self"` on
    every clickable parent, no descendant or attribute selectors, no `<button>` or DOM elements,
    `{#if}` instead of `display: none`, icons tinted through `currentColor`, and every app-only
    class present in `src/styles/_own.sass` with the strict style check green.

11. Overlays (the model panel, the thinking panel, the usage popover, context menus, the
    Add provider modal) are anchored to their trigger where the reference anchors them, sit above
    everything else, take keyboard focus while open, trap Esc, and are dismissed by a click
    outside them. The command palette's existing scrim-and-dialog behavior is the model for the
    modal case.

## Non-goals

- **The converter tools** (CSS → Sass, React → Svelte) and the Home surface: untouched,