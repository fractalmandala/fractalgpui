# PROJECT_LOG.md — agent workbench implementation

Tracks implementation of `PRODUCT.md` / `TECH.md` (agent workbench). Checkpoints, probes,
decisions, and current state — so a future session can resume without re-exploring.

## Baseline (2026-10-05)

- `npm run typecheck`: clean.
- `npm test`: all 9 test files passed.
- Live store `~/Library/Application Support/fractalgpui/pi/agent.sqlite`: one conversation (id 1, root).

## Slice 0 — host prerequisites

- **0.1 context menus: RESOLVED, no patch.** Headless probe (`scratch/ctxmenu/probe.ts`,
  `click(node, { button: 2 })`): right-click arrives as `auxclick` with `isRightClick: true`
  (plus `mousedown` with `button: 2`); `oncontextmenu` stays silent (`contextMenu` is not in
  `GPUI_EVENTS`). Decision: context menus bind `onauxclick` gated on `e.isRightClick === true`.
  Left click must never open a menu (permanent assertion in `agents/test.ts`).
- **0.2 native folder picker: OPEN, upstream.** No picker/dialog API in `@gpuix/native`; binary
  is compiled (upstream `github.com/remorses/gpuix`). Until it lands: typed-path row behind one
  `pickFolder()` indirection.
- **0.3 arc gauge: OPEN, upstream.** No canvas/shape painting API; icon+number fallback behind
  `ContextGauge.svelte` until it lands.

## Slice 1 — session index and projects

Done and verified 2026-10-05: `metadata.ts` (`SessionsDoc` + title/bucket/order helpers),
`sessions-io.ts` (durable ops, no UI framework), `sessions-sql.ts` (below-the-API delete),
`sessions.svelte.ts` (reactive shell + memory drafts), `sessions.test.ts` (19 tests, all pass),
`conversationCreated` seed hook in `openHarness`.

Findings while building:
- F1: Chord strict-JSON rejects explicit `undefined` in doc writes. `thinkingLevel` must be
  omitted (never assigned `undefined`); `freshSession` no longer includes the key.
- F2: `Session.commit` requires `(change, context)` — two args, not one.
- F3: scans paginate as `{ items, next? }`, and `scanEntries` is newest-first (first-user-text
  walks to the last page).
- F4: `openNodeSqliteStorage` is async — schema is not present until awaited.
- F5: range edits can eat neighboring lines; always re-read the file after structural edits
  (lesson for future slices).
- F6 (E2E pass): `ensureIndex` had no watch-path coverage. Added a live-watch test
  (subscribe → create → rename delivered without re-read → `stop()` quiets).
  Caught a test-only race: deliveries can land before the created id is assigned,
  so the test accumulates snapshots instead of filtering by id.

## Slice 2 — chat registry, tabs, panel session
Done and verified 2026-10-05: `AgentChat` is per-session (registry in
`session.svelte.ts`, one instance per open session shared by all regions); `pi` slot moved to
`models.ts` as `modelDefaults` (new-session default); model/thinking/type/access are per-session
fields persisted to `SessionMeta`; `active.surface` tabs + `active.panel` with `pi-active` slot;
root conversation is the default session (upgrade keeps history, stale-heal test unchanged);
`agents/test.ts` rewritten to the registry API (29 checks, all pass); `test/panels.ts` awaits
`ensureActive()` before asserting the panel.

Findings while building:
- F7: `idFromNumber` is NOT exported from the pi-durable root (only `ConversationId` type is);
  brand locally with `Number(id) as ConversationId`.
- F8: mount-time `$effect`s race — `ensureActive()`/`panelChat()` need in-flight promise guards
  or two panel sessions get created on one mount.
- F9: D5 refined — Agents tabs vs panel must differ (refused + tested); Home/Tools panel mirrors
  the main session through the shared instance (one subscription, allowed).

## Slice 3 — env, workspace context

Done and verified 2026-10-05: `HarnessOptions.env` builds a `NodeExecutionEnv` per
conversation from the agent `cwd` (Slice 2 already configures model/thinking/cwd on every
send); `workspace.ts` reads branch + worktree count via `git` (cached 30s, never throws);
`env.test.ts` (write/read/exec round-trip, missing-file errors) and `workspace.test.ts`
(branch, linked-worktree count, non-repo, missing path, cache/invalidate) — 7 tests, all pass.

Deferred honestly: the `target.cwd → env` wiring itself is only 3 lines and cannot be observed
with Slice 4's tool tests; until then the direct `NodeExecutionEnv` smoke stands in.

## Slice 4 — tools, approvals, todos

Done and verified 2026-10-05: `tools.ts` installs `CodingTools` + `fractalTools` (policy wraps,
`todo` tool, workspace prompt section) in `openHarness`; approval entries + `fractal.approvals`
decision docs with `watchDoc` wait and `pi.live` stop-poll; `projectEntries` renders approval rows
(status from the doc) and live tool slots; `AgentChat.todos` projected; minimal approval row in
Transcript (rich UI is Slice 7). `policy.test.ts` (decision table) + `tools.test.ts` (7 full-loop
runs through the real scheduler: approve/deny/full/plan-refuse/no-workspace/confinement/todo) +
`project.test.ts` approval/live-slot rows — all pass, full suite green.

Findings while building:
- F10: `fauxToolCall` + scripted responses drive REAL tool runs through the scheduler — the E2E
  proof pattern for everything durable (also proved Slice 3's env wiring: the approved write
  landed in the session folder).
- F11: `env.canonicalPath` fails for nonexistent paths, so writes to new files need
  nearest-ancestor resolution (`canonicalUnder`); unresolvable stays refused, never guessed.
- F12: no decision timeout — the approval wait is durable (survives restarts) by design; the
  stop-poll covers abandoned runs and the timer is unref'd.
- F13: plan/ask enforcement is refusal-with-reason at call time, not tool-list filtering
  (TECH updated); the `todo` tool always runs (run bookkeeping, not workspace work).
 ## Slice 5 — providers catalog, credential store, custom endpoints

 Done and verified 2026-10-05: `providers.ts` (CredentialBag, env-wins
 `createCredentialStore`, `keyEnvFor`/`envKeyFor`/`maskKey`/`keySource`,
 `importLegacyKeys`, `authSections`, `createCustomProvider`, `fetchEndpointModels`)
 with `providers.test.ts` (10 tests, all pass); `models.ts` rewired to
 `builtinModels({ credentials })` + `persisted('pi-credentials')` slot (entries array,
 one-time `pi-keys` migration) + `persisted('pi-providers', { enabled, custom })`
 with live `saveCustomProvider`/`removeCustomProvider`, `isProviderEnabled`/
 `setProviderEnabled`, `providerSections`, `loginSubscription`, and store-backed
 `saveKey`/`clearKey`/`maskedKey`/`keyStatus`/`injectStoredKeys`.
 `PROVIDERS`/`DEFAULT_MODEL` stay as shims for the current sidebar/session call sites
 (TECH §5 updated); Slice 7 deletes them with the Settings surface. Verified: typecheck
 clean, full `npm test` green (all headless suites + bun 152 pass), plus a 28-check
 scratch probe (`scratch/slice5/probe.ts`) over the real builtin path — catalog breadth,
 sections, custom round-trip + collision, key save/mask/env-wins/clear, enable toggles.

 Findings while building:
 - F14: `persisted`'s merge drops free-form map keys (iterates defaults), so the
   credential bag maps over an `{ entries: [...] }` array slot, not a record.
 - F15: no Svelte transform under plain `bun test` (`$state is not defined`) — src
   bun tests must stay pure-TS (no `.svelte.ts` import chain). A `models.test.ts`
   was written, then deleted for this reason; wiring is covered by the scratch
   probe instead, UI by Slice 7's settings/test.ts.
 - F16: `saveKey`/`clearKey` must write synchronously — the sidebar reads the mask
   back in the same tick (agents/test.ts caught the async gap immediately).
 - F17: anthropic's builtin auth is `{ apiKey, oauth }` → sections `['keys',
   'subscriptions']`; subscription sign-in is real for more than one provider.
 - F18: `expect.any` does not exist in this repo's `bun:test` types; `Bun` and
   `afterEach` are likewise untyped — use `globalThis` narrowing and explicit
   setup/teardown helpers (see `providers.test.ts` `serve`/`withEnv`).
## Slice 6 — usage projection and INR rate

Done and verified 2026-10-05: `usage.ts` (`contextFigures` from
`estimateContextTokens` + model window; `providerFigures` with null-not-zero
unreported counters and `cacheRead / (cacheRead + input)` hit rate;
`toolFigures` names/tokens/byTool/inFlight; `countToolCalls` over committed
`pi.tool-result` entries for the popover's call count; `createSpeedTracker`
with injectable clock) + `usage.test.ts` (13 tests); `fx.ts` (`fetchInrRate`
against `open.er-api.com/v6/latest/USD`, `createFx` with daily refresh and
offline-keeps-last-standing semantics, `convertUsd`, `formatInr`, lazy
`appFxBag()` over `persisted('fx')`) + `fx.test.ts` (6 tests, injected fetch —
no network). Nothing wired into the UI yet (Slice 7); `formatUsage` sidebar
line untouched. Verified: typecheck clean, new tests 19/19, full `npm test`
green (server left live throughout — pure `.ts` kernel, no restart needed).

Findings while building:
- F19: `AssistantMessage.usage`/`timestamp` are required fields — fixtures must
  include them (and `stopReason`) for tsc.
- F20: committed per-call tool counts are not in `pi.usage`/`pi.live`
  (TECH §6 updated) — `countToolCalls(entries)` fills the gap at render time.
- F21: the app's `persisted` slot binding must stay lazy (`appFxBag()`) so
  `bun test` can import `fx.ts` without the Svelte transform (F15).
## Decisions

- D1 (PRODUCT, user): no per-prompt override; INR rate is fetched (see TECH §6 `fx.ts`).
- D2 (probe): right-click = `onauxclick` + `isRightClick`, no `GPUI_EVENTS` patch.
- D3 (TECH): `SessionsDoc` singleton (not per-conversation family) — one `watchDoc` subscription
  for the whole history sidebar.
- D4 (TECH): default agent type `build`, default access `supervised`; never silently Full access.
- D5 (TECH): surface tabs and the sidebar panel must never point at the same conversation id.

## Resume notes

- Dev loop: `.svelte`/`.sass` hot-reload; **`.ts` edits need a full `npm start` restart**.
- `npm test` + `npm run typecheck` green after every slice.
- Headless probes live in scratch with a symlinked `node_modules`; run via
  `bun node_modules/gpuix-svelte/bin/gpuix-svelte.js --bun <probe>`.

## Slice 7 — agent surface UI (sessions/projects, composer, panels, usage, approvals, Settings)

Done and verified 2026-10-05: history sidebar (`SessionList.svelte` +
`WorkspaceRow`), composer with type/access/model/thinking chips
(`Composer`, `ModelPanel`, `ThinkingPanel`), usage gauge + popover
(`ContextGauge`, `UsagePopover`, `usage.ts`/`fx.ts` from Slice 6),
approval/tool rows in `Transcript`, provider/model Settings surface
(`src/surfaces/settings/` + `login.ts`), new commands
(`session.new/rename/delete/archive.toggle`, `model.choose`,
`thinking.choose`, `transcript.copy`, `settings.open/models`), UI
primitives (`Menu`, `ContextMenu`, `Modal`, `SearchInput`, `Chip`).
Verified: typecheck clean, full `npm test` green (9 files: styles, ui,
layout, shell, panels, agents 78 checks, css-to-sass, react-to-svelte,
bun 180 pass).

Findings while building:
- F22: `ensureAppWatches` retry-on-every-render is a self-feeding loop.
  The attempt ended with `render()`, and `render()` calls
  `ensureAppWatches()` first thing — so every no-op retry (docs missing,
  the common case) immediately respawned. At speed it saturates the
  Chord session queue (all other durable ops starve) and starves timers
  (CPU spin, `setTimeout` never fires). It masqueraded as a
  menu-triggered branch wedge: any timer-await after any send hung.
  Fix in `session.svelte.ts`: attempts gated to one per 2s
  (`WATCH_RETRY_MS`), no render-on-completion (render only when a watch
  actually stands), plus a single unref'd timer re-arm so quiet periods
  (a run paused on approval commits nothing, so nothing re-renders)
  still retry; `decide()` retries immediately so the row flips on answer;
  timer cleared on `close()`.
- F23: headless `click()` on an uncommitted row spins: `find_test_id`
  reads the native tree, so without an intervening `settle()` the row is
  missing and `bounds(undefined)` never returns. Tests must `settle()`
  after kernel-direct state changes before clicking.
- F24: background `bun` jobs die with the tool call; foreground is capped
  around ~2 min. Long suites run in tmux (`tmux new-session -d -s …`)
  and are polled via the log file.
- Pre-existing tree drift (not Slice 7, kept deliberately): warm-paper
  light `bg-surface #fefbf5` (`_own.sass`, was fractalstyler `#f8f5ef`).
  `test/styles.ts` now pins the tree value with a comment; revert is one
  line either way. The drift's `SidebarLeft` rewrite used `xnav-` testIds
  + `IconAlt` + descendant selectors; restored to `IconButton` with
  `nav-` ids (shell test now also asserts `nav-settings`), deleted
  `IconAlt.svelte` and the `.button-group` rule.
- `agents/test.ts` holds 78 checks (was 80): transcript-copy now selects
  the boot session and asserts its post-reset exchange (`Healed.` —
  `reset` scopes earlier entries out, so `Paris.` is gone from the rows).

## Slice 8 — commands polish

Done 2026-10-05: all PRODUCT §9.8 commands registered and covered —
`session.new` (⌘N), `session.rename`, `session.delete`,
`session.archive.toggle`, `model.choose`, `thinking.choose` (⇧⌘T),
`transcript.copy`, `settings.open` (⌘,) + `settings.models` — exercised
in `agents/test.ts` (keyboard) and `test/shell.ts` (palette ordering
unchanged).

## Live-dropdown fixes (2026-10-05, same day)

Real-window defects the headless suite could not see (no vision, no
hover/paint cost in the test renderer):
- ThinkingPanel + Menu rows used fixed-height single-line rows
  (`row ycenter h-md`) with two-line content (label + description) — rows
  rendered crushed/overlapping, so dropdowns mis-hit. Rows are now
  auto-height (`box`) with the icon/texts/check in one inner row.
- ModelPanel rebuilt the full provider catalog per row per render
  (`flat()` inside `class:active` and `onmouseenter`) — O(n²) with
  hundreds of live models, janking real repaints on hover. The list is
  now memoized per query/selection (`$derived`), rows use
  `allRows.indexOf`.
- Upstream prerequisites actually filed: `remorses/gpuix#82` (native
  folder picker + canvas/shape painting API). The typed-path project row
  stays the spec'd interim path behind `pickFolder()` until it lands.

F25: native Taffy layout never converges on a hundreds-deep row tree —
sampled the wedged live app at 87.8% CPU inside
`compute_flexbox_layout`/text-shaping with the model panel open. The
panel now renders at most 60 rows (`ROW_LIMIT`) with an "…and N more"
line; search narrows, keyboard nav covers the rendered rows, the footer
keeps the real total. Same class of wall applies to any unbounded list;
SessionList stays unvirtualized for now (one-line rows).

## Folder picker (2026-10-05, same day)

Built instead of waiting on upstream (`remorses/gpuix#82` filed, no
response): `src/kernel/folders.ts` (pure dir list/navigate/validate,
4 bun tests) + `src/ui/FolderPicker.svelte` (Modal dialog: breadcrumbs,
Up, capped subfolder list, typed-path jump with inline reasons,
Choose/Cancel) behind the `pickFolder()` indirection (same
`initial`/`onchoose`/`onclose` props the native call will take). Wired
into the composer **Choose folder** and a history **Browse** button; the
typed-path rows stay as fallback. `agents/test.ts` covers open, typed
jump, descend, up, choose-moves-session, cancel, history choose (78 → 87
checks). F26: unbounded in-flow lists also break headless clicks (target
outside the 538px viewport) — picker and model lists are bounded with
`wb-palette-list` (320px) on top of their row caps.

## Pibots merge, Stages 1-2 (2026-10-12, branch `feat/pibots-merge`)

Plan and decisions: `docs/PLAN-pibots-merge.md` (Status section). Built: `fractal.bots` document and bot store
(`src/kernel/pi/bots/`), `SessionMeta.botId`, per-bot folders and botroom, ported audit log / caps / destructive
detector / personality / profile / temporal memory, and the `fractal-bot` extension that makes a bot session use its bot
(sections identity → character → capabilities → profile → memory view; tools character_edit, profile_update,
memory_zoom, memory_date). `guardTool` in `tools.ts` gained the bot path (capability toggles, botroom workspace,
destructive → existing approval row, audit before/after, 32k caps); plain sessions are unchanged.

Findings: F27: pi-durable `ConversationId` is a number — a string id silently returns no conversation from
`h.conversation()` (caught while detaching sessions on bot delete). F28: faux-provider factories receive
`{messages}` only; the system prompt arrives as a `system` message with `content` + `sections`, tools are not in the
context (assert them via `conv.agent().tools`). F29: the repo's `test/bun-test.d.ts` shim has no `test.each`, `afterEach`
or per-test timeouts — tests use `afterAll` and loops.
Baseline note: before this work `npm test` already had 12 failing bun tests (react-to-svelte converter) and 5 headless
files failing on the uncommitted style/icon changes (e.g. icon 20px vs 16px, missing `surface-tools`); the failing set
is identical after this work. Not run: real provider summarizer, anything in the live window.
