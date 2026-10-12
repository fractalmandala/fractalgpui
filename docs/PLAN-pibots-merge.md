# PLAN — merging pibots into fractalgpui

Branch: `feat/pibots-merge`. Decision made: fractalgpui is the app; pibots' TypeScript harness
(`github.com/fractalmandala/pibots`, `harness/src`) moves in as in-process kernel modules; pibots' Rust/GPUI UI
and its unix-socket protocol are retired. Status of this document: updated after Stage 2 (see **Status** below).

## Status

| Stage | State |
|---|---|
| 0 Playwright under Bun | DONE |
| 1 Data model | DONE: `bots/meta.ts` (`fractal.bots`, versioned `BotMeta`, ids `bot_<10 base36>`, avatar fallback, diff), `bots/paths.ts` (botroom + per-bot home), `bots/store.ts` (create / `updateBot` patch→diff with `dryRun` / confirmed `setIdentity` / duplicate / delete keeps sessions and detaches / list / `watchBots`), `SessionMeta.botId?`, `createSession(..., {botId})` |
| 2 Kernel move | DONE for audit, caps, destructive detector, personality, profile, temporal memory, bot wiring. NOT ported yet: `tools-fs.ts` (not in this slice), `disk.ts`, browser, usage windows, provider-policy deltas (Stages 3-5) |

Decisions made while building (all revisitable):
- Deleting a bot keeps its sessions (botId cleared, bot extension deselected). Files: botroom never deleted; the bot home (audit, memory, browser profile) stays unless `removeHome`.
- `botId` is an omitted key for plain sessions (never `undefined`, never `null`), so old rows need no migration.
- The bot extension (`fractal-bot`) is not in the host default selection (`DEFAULT_EXTENSIONS` in `tools.ts`); a bot session selects `[fractal-bot, coding-tools, fractal-tools]` at creation. Plain sessions see no bot tools or sections.
- Policy: bot sessions skip folder confinement (bots roam; the `access` mode and plan/ask modes still apply), force an approval for destructive calls even in `full` access (the reason is shown in the existing approval row), write an fsynced audit row BEFORE every call (if it cannot be written the call does not run) and one after, and cap results at 32k chars. Plain sessions are byte-for-byte as before.
- Temporal memory is ADDITIVE here: the full transcript is still sent and the `<memory_view>` is an extra section (pibots disabled compaction and replaced history with the view). Switching to view-only history is a separate decision.
- Memory records finished user/assistant turns when the prompt is built (entries have no timestamps, so lines are stamped at sync time); the current user message is excluded until it is answered.
- Memory summaries use the bot's `summaryModel` or the session's model via pi-ai; with no provider/key the lines stay pending and are shown as "(not summarized yet)" (nothing is faked).
- `classifyDestructive` is kept conservative as ported (e.g. `grep -r rm .` asks).

Tests: `src/kernel/pi/{audit,caps,destructive}.test.ts`, `bots/{store,profile,memory,session}.test.ts` (83 new bun tests).

## What exists in fractalgpui (verified in source)

- **One durable harness per app**: `src/kernel/pi/harness.svelte.ts` (`openHarness`) opens a single
  pi-durable `Harness` on `<data_dir>/pi/agent.sqlite` (MemoryStorage in tests), with a registry
  (`installAgentTools`) and a per-conversation `NodeExecutionEnv` rooted at the session's workspace.
- **Sessions = pi-durable conversations.** `metadata.ts` defines the session-scoped singleton doc
  `fractal.sessions` (`SessionsDoc`: `sessions{id→SessionMeta}`, `projects{id→ProjectMeta}`); `sessions-io.ts`
  (ops), `sessions-sql.ts` (delete), `sessions.svelte.ts` (reactive shell). `SessionMeta` has title, projectId,
  timestamps, pinned/archived, provider/modelId, thinkingLevel, agentType, access. A Project is a folder.
- **Tools/approvals**: `tools.ts` wraps pi-durable `CodingTools` (bash/read/write/edit) with an access policy
  (`supervised|edits|full`), adds `todo`, durable approvals (`fractal.approval` entries + `fractal.approvals` doc).
- **Models/providers/usage**: `models.ts`, `providers.ts`, `usage.ts`, `fx.ts`, `project.ts` (transcript projection).
- **UI**: `src/surfaces/agents/*` (SessionList, Composer, Transcript, ModelPanel, ThinkingPanel, UsagePopover,
  `session.svelte.ts` = per-session `AgentChat` registry), registered in `src/surfaces/index.ts`
  (`SURFACES = [home, tools, agents, settings]`). Surfaces plug into sections (`sidebar-left`, `sidebar-panel`,
  `sidebar-right`), `tabs`, `toolbar`, `commands`.
- **Tests**: headless GPUI suites per surface (`src/surfaces/<id>/test.ts`, one process each) + `bun test ./src`
  for UI-free logic (`*.test.ts`), run by `npm test` (`test.ts`). Style strictness test (`test/styles.ts`).
- Known open upstream gaps (PROJECT_LOG): no native folder picker (typed-path row), no canvas (icon gauge),
  context menus via `onauxclick`.

## What pibots contributes (`harness/src`) and where it lands

| pibots module | What it does | Lands in fractalgpui | Notes |
|---|---|---|---|
| `audit.ts` | append-only JSONL, row fsynced BEFORE and after every action | `src/kernel/pi/audit.ts` | Per-bot file under bot home. Independent of pi-durable; keep as is. |
| `policy.ts`, `caps.ts` | audit-before-act hook, destructive-action approval, result caps | merge into `tools.ts` policy wrapper | fractalgpui already has approvals via durable doc; reuse **its** approval UI/entries, port pibots' *destructive detector* + audit calls + caps. Keep pibots' "no path restriction" choice only for bots, `access` modes still apply. |
| `tools-fs.ts` | roaming list-dir / search | `src/kernel/pi/tools-fs.ts` | Register in `installAgentTools`. Sessions rooted at a project folder keep cwd; bots may roam. |
| `browser.ts` | Playwright persistent profile, screenshots by path, mirror frames | `src/kernel/pi/browser.ts` | See Stage 0. One BrowserController per bot. |
| `personality.ts` + `personality.schema.json`, `schema.ts` | identity (locked), character (editable), capabilities, memory posture | `src/kernel/pi/bots/personality.ts` | Stored as a **bot doc** (see data model), rendered as prompt `section`s. Tools `set_identity`, `character_edit` kept. |
| `profile.ts` | small always-present facts, propose/commit | `src/kernel/pi/bots/profile.ts` | Same storage as personality. |
| `memory.ts` | UniiChat-style temporal memory (leaf summaries, merged roots, zoom/date tools) | `src/kernel/pi/bots/memory.ts` | Needs a per-bot store (node:sqlite file or tables) — NOT a conversation doc, because it spans sessions. |
| `usage.ts` | session tokens + windows (rate-limit headers, OpenRouter `/key`) | merge into `src/kernel/pi/usage.ts` | fractalgpui's usage.ts has tokens/cost/context; add the *window adapters* + fetch tap + persisted totals. Honest-absence rule (never estimate). |
| `provider-service.ts`, `custom-providers.ts`, `keys.ts`, `selection.ts`, `settings.ts`, `env-policy.ts`, `provider.ts`, `opencode.ts` | kept-models policy, env-detected providers (ignorable), 0600 key files, custom endpoints | compare with `models.ts`/`providers.ts`; port only the delta: **kept-models-only dropdown**, "detected from env" + ignore, proxy-env blocking (`BLOCKED_ENV`) | fractalgpui already has custom endpoints + key store; do not duplicate. |
| `disk.ts` | allocated-bytes disk usage per bot, budgets | `src/kernel/pi/bots/disk.ts` | Shown in Bot editor. |
| `bot.ts`, `main.ts`, `server.ts`, `protocol.ts` | one bot = one root conversation; socket server + wire types | **dropped** | See below. |

### The socket protocol is dropped
`server.ts`/`protocol.ts`/`main.ts` exist only because the Rust UI was a separate process. Here the UI and
harness share one Bun process: Svelte state (`*.svelte.ts`) calls kernel functions directly and subscribes with
pi-durable `watchDoc`/`watchEvents`. Pibots' protocol types survive only as plain TS types where useful
(e.g. `BrowserState`, `PendingApproval` → reuse fractalgpui's approval type instead). Pibots' protocol fixtures and
socket tests are not ported; their *behaviour* tests (audit, policy, memory, usage, personality) are.

## Data model: Sessions/Projects vs Bots

pibots: bot = one root conversation, with personality/profile as conversation docs. fractalgpui: many
conversations, indexed by a session-scoped doc. Merge design:

- **Bot** = long-lived identity, owns many sessions. New session-scoped singleton doc `fractal.bots`
  (`BotsDoc`, alongside `SessionsDoc`, in `src/kernel/pi/bots/meta.ts`):
  `bots{id → { name, avatar?: path, identity (locked), character, capabilities, profile[], memoryPosture,
  roles[], workspace, createdAt, archived }}`.
- `SessionMeta` gains **`botId: string | null`** (null = plain session as today; fully back-compatible, no
  migration of existing rows). `projectId` stays: a Project is a folder; a bot's default workspace is its **botroom**
  folder (`<data_dir>/botroom/<bot-slug>/`, created on bot creation) which acts like an implicit project.
- Prompt: a pi-durable `section` extension reads the session's bot from `BotsDoc` and renders identity → character →
  profile → temporal view (memory) before the workspace section. Because personality lives in the bot doc, editing
  it affects all of that bot's sessions at once.
- Per-bot on-disk home `<data_dir>/bots/<id>/`: `audit.jsonl`, `memory.sqlite`, `browser-profile/`, `media/`, `avatar.*`.
- Doc is the source of truth; edits are explicit **Save** with a diff (UI holds a draft; `commit` writes the doc and an audit row).
- Risk: Chord strict-JSON rejects explicit `undefined` (log F1) — omit optional keys.
- Open question to settle in Stage 1: are `roles` plain strings referencing a catalog (Stage 6) or embedded definitions? Proposal: ids into a catalog.

## Stages

0. **Playwright under Bun — DONE, passes** (below). No sidecar needed.
1. **Data model**: `bots/meta.ts` (`BotsDoc`), `SessionMeta.botId`, `newSession({botId})`, session list grouping
   by bot (filter, not a new tree). Tests: bun tests like `sessions.test.ts` (create, rename, archive, session→bot
   link, upgrade of old docs without `botId`).
2. **Kernel move** (headless, no UI): audit, caps, policy additions, tools-fs, personality+profile+schema, memory,
   disk. Port each module with its pibots tests (`bun test`). Register via `installAgentTools` and a `botExtension`.
   Gate: `npm run typecheck` and `npm test` stay green after every module; one commit per module.
3. **Bots surface** `src/surfaces/bots/` (index.ts, state.svelte.ts, test.ts): sidebar-left = bots list (explorer);
   main = editor (identity locked with explicit unlock, character, capabilities, profile, memory posture, roles,
   disk); Save-with-diff bar; "New bot" creates botroom folder; avatar = image if set, else generated (deterministic
   from name hash: color + initial, drawn with ordinary boxes since there is no canvas).
   Add after `agents` in `SURFACES`. Uses existing `Icon` set (`bot`, etc.), fractalstyler classes only (`wb-` for new).
4. **Browser surface/panel**: `BrowserController` per bot, lazily launched, headed default (user can take over),
   headless fallback; panel in `sidebar-right` showing URL/title/status and the last frame. No live canvas
   exists in GPUI, so the mirror is a periodically refreshed image from a JPEG file (Stage 0: ~17 ms/shot).
   Needs an `Image`-from-path primitive check in gpuix-svelte (probe first; fallback = status + "open frame" button).
5. **Models & usage policies**: kept-models-only list, env-detected providers shown ignorable, never use proxy
   env (`BLOCKED_ENV`), usage windows (anthropic/x-ratelimit headers, OpenRouter `/key`) in `UsagePopover.svelte`.
6. **Roles & plugins**: roles catalog / in-use lists in the Bot editor; Agent Plugins loading
   (registry extension discovery from a plugins dir, each plugin listed with enable toggle). Scope to be set after Stage 3.
7. **Retire pibots Rust UI**: archive notice in pibots repo README; keep `.dmg` flow (`build/dmg.ts`) – verify Playwright
   and its browsers are not bundled (see caveats); delete nothing in this repo.

## Stage 0 result — Playwright works under Bun 1.4.3

Env: macOS arm64, Bun 1.4.3, `playwright@1.64.0` (the version pibots pins), Chromium 1248 already in
`~/Library/Caches/ms-playwright` (matches 1.64.0; no download was needed).
Probe `scratch/playwright-bun/probe.ts`: `launchPersistentContext` → `goto file://` → `innerText` → `evaluate` → `screenshot` → `close`.

| Runtime | Mode | Launch | Total | Result |
|---|---|---|---|---|
| `bun probe.ts` | headless | 363 ms | 445 ms | OK |
| `bun probe.ts` | headed | 1816 ms | 2079 ms | OK, window opened and closed |
| `node probe.ts` (v26) | headless | 94 ms | 157 ms | OK (reference) |
| `gpuix-svelte --bun probe.ts` | headless | 136 ms | 200 ms | OK |
| `gpuix-svelte --bun probe.ts` | headed | 580 ms | 780 ms | OK |
| `gpuix-svelte --bun probe2.ts` (local `Bun.serve` page, 10 JPEG screenshots q60) | headless | – | 16.9 ms/shot, ~8 KB | OK, clean exit |

Not tested: a probe running *inside the live app window* (the GPUI event loop with Svelte mounted) — only inside the
`gpuix-svelte --bun` runtime. Do that as the first task of Stage 4. Fallback if it misbehaves there:
spawn `node` child with JSON lines on stdio (Node starts in ~100 ms and also works) — not needed so far.
Caveats: add `playwright` (exact `1.64.0`) to `package.json`; browsers are not installed by npm —
`npx playwright install chromium` once (~150 MB, to `~/Library/Caches/ms-playwright`; `PLAYWRIGHT_BROWSERS_PATH`
overrides); first-run message should say so. Use `process.exit` or explicit `ctx.close()`; probes always closed cleanly.
Packaged `.dmg` will not contain browsers; the app must locate/install them at runtime.

## Test strategy

- Pure logic as `*.test.ts` under `bun test ./src` (audit, caps, policy detector, personality validation, profile,
  memory merge/zoom with a fake summarizer, usage windows with fake fetch, disk).
- Headless GPUI suites per surface (`src/surfaces/bots/test.ts`) with the faux provider; one process each.
- Browser: one integration test launching headless Chromium against a local `Bun.serve` page; skipped (not failed)
  when Chromium is not installed.
- Real-provider and headed-browser checks stay manual (listed per stage in PROJECT_LOG).
- Every stage ends with `npm run typecheck` + `npm test` green and a PROJECT_LOG entry.

## Risks

- gpuix / gpuix-svelte are young and pinned to one commit; no picker/canvas/CSS transitions.
- Memory module is the largest port (298 lines + a background summarizer call); needs a model call outside a
  conversation — verify pi-ai direct `complete` usage in-process.
- Per-bot data now spans sessions: deleting a bot needs a clear policy (sessions archived or deleted?). Decide in Stage 1.
- The pibots audit guarantee ("row fsynced before the action") must survive the move into fractalgpui's wrapped tools; test that a crash between audit and tool leaves a `before` row.
- Playwright inside the live app event loop not yet verified (Stage 4 first task).
