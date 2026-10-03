# Token audit — hard-coded style values vs fractalstyler tokens

Baseline audit of `apps/fractalgpui` at commit `19968de` (the tables after **Current state** describe that baseline). The values were then snapped to tokens; **Current state** below is what holds now.

**Scope.** `src/styles/_own.sass`, every `.svelte` file (inline `style`, `hover=` / `active=` attributes, motion), and TS that sets sizes or colours (`src/kernel/layout.svelte.ts`, `src/kernel/window.svelte.ts`, `src/app.ts`, plus constants in component scripts).
**Reference.** Token values are fractalstyler's (`packages/fractalstyler/src/lib/styles/_00_tokens.sass` and the files it pulls in), flattened to px by our adapter (`build/tokens.ts` + `build/fractalstyler.ts`). This is the same map `design.tokens` hands to `set_css_vars` at runtime.

**Verdicts**
- **exact**: the value equals an existing token. Weights count as exact when fractalstyler ships the matching `.weight-N` class, because there is no weight custom property. Half-height radii on pills count as exact for `--radius-full`, since they draw the same shape.
- **nearest**: no token has this value. The closest token in the same role is named, with Δ = value − token. When two tokens are equally close, both are listed.
- **no token exists**: fractalstyler has nothing for this role (border widths, layout geometry), or the value is one of the app's own palette overrides of a fractalstyler colour role.

Excluded: `0`, `100%`, `transparent`, values already written as `var(--…)`, and the sample CSS strings in CSS→Sass (those are content, not styling).

## Current state (after snapping to tokens)

Every audited size in `_own.sass` now reads a fractalstyler token through `var(--token)`. The app's own sheet is translated with `live: true` (`build/gpui-css.ts`, `build/styles.ts`), which keeps those `var()`s as runtime variables instead of inlining them at build time. A `set_css_vars` call with an edited token map (the live editor) therefore repaints `_own.sass` rules without a rebuild. The flattened map that `App.svelte` already hands to `set_css_vars` (`design.tokens[mode]`) carries every name these rules read. `test/styles.ts` checks this in both modes and fails on any new literal px for font-size / padding / margin / gap / width / height / radius.

| Baseline verdict | Count | Now |
|---|---|---|
| exact | 41 | **31 reference tokens via `var()`.** That covers 25 `_own.sass` rule values, plus `--bg`, `--bg-raised` and `--bg-input` (light) → `var(--white-fixed)`; `--bg-surface` (light) and `--greenpop2/3` drop their identical overrides and inherit fractalstyler's. **10 stay literal:** the 7 font weights (fractalstyler has `.weight-N` classes but no weight token a rule can read), `--greenpop1/4` (swapped against fractalstyler; a `var()` to each other would be circular), and the CSS→Sass textarea row (20px is GPUI's row height, not ours). |
| nearest | 32 | **31 snapped** to the token named in the baseline: 27 in `_own.sass` rules, `--on-accent` → `var(--black-fixed)`, and the 3 sidebar defaults, which now read `--sidebar-width-left` / `--sidebar-width` / `--sidebar-width-right` (280px each) from `design.tokens` in `kernel/layout`. **1 kept:** `.wb-toggle` padding 2px. This is fractalstyler's own switch geometry: `.switch-track` is a 1px border + 2px padding around `--switch-thumb`, which makes `--switch-h`. With 4px padding the 16px thumb would not fit, so the toggle now has a 1px track-coloured border like fractalstyler's. |
| no token | 51 | Unchanged: palette colour overrides, border widths, layout widths, palette geometry, window sizes. One documented no-token literal was added: the toggle's 1px border. |

Where the baseline listed two equally near tokens, this was picked:
- `.wb-btn` / `.wb-icon-btn` 28 → `--control-h-bs` 32.
- `.wb-btn` padding-x 10 → `--space-md` 12; `.wb-seg-item` padding-x 10 → `--space-sm` 8.
- 13px control text → `--text-sm` 12.
- `.wb-seg-item` / `.wb-brand` radius 6 → `--radius-sm` 4 (nests inside the 8px segment with 4px padding).
- `.wb-card` radius 12 → `--radius-md` 8.

Literal px still allowed in `_own.sass`, as listed in `test/styles.ts` `LITERAL_OK`:
- `.wb-toggle padding: 2px` (switch geometry).
- `.section-sidebar-left.rail width: 52px` (layout, kernel/layout `RAIL`).
- Border widths (1px, plus the 2px tab underline) are outside the checked properties and stay literal (no token).
- `:root --wb-palette-*` geometry is a custom-property definition, not a rule value.

**What changed visually**
- Buttons and icon buttons: 28 → 32 tall.
- Tab bar: 40 → 38.
- All section/panel headers: 44 → 38.
- Segmented control: outer padding/gap 2 → 4, item radius 6 → 4, item padding-x 10 → 8.
- Toggle: 30×18 / 14px knob → 40×22 / 16px thumb.
- Labels and pills: 11 → 10.72px text.
- Tabs, nav items and the brand: 13 → 12px text.
- Card radius: 12 → 8.
- Home tile: 264 → 240 wide.
- Splitter: 5 → 4.
- Text on the accent: #000 → #171717.
- Sidebar defaults: 240 / 340 / 300 → 280 / 280 / 280. Widths the user has already resized are kept.

## Baseline counts (19968de)

| | exact | nearest | no token | total |
|---|---|---|---|---|
| `_own.sass` rules | 32 | 28 | 9 | 69 |
| `_own.sass` custom properties (palette + geometry) | 8 | 1 | 34 | 43 |
| TS / script constants | 1 | 3 | 8 | 12 |
| **All** | **41** | **32** | **51** | **124** |

`.svelte` components have **no** hard-coded style values. Their markup uses only fractalstyler classes (`text-sm`, `weight-600`, `pad-md`, `gap-md`, `text-primary`, …), which are token-backed already. There are no `hover=` / `active=` attributes and no motion. The only inline `style` is `width: ${width}px` in `shell/SidebarLeft.svelte` and `surfaces/tools/Sidebar.svelte`, and it carries the live widths from `kernel/layout` (counted under TS).

## Biggest offenders (baseline)

1. **The app palette overrides almost every fractalstyler colour role.** In light mode, 15 of 17 overridden roles differ from fractalstyler's value. Only `--bg` and `--bg-surface` match; `--bg-raised` and `--bg-input` are re-pointed to pure white (= `--white-fixed`). In dark mode all 17 differ: the app uses a near-black ladder (#000 → #0A0A0A → #111111) where fractalstyler uses #101010 / #202021 / #3a3a3a, plus much darker hover/selected colours (#151517 / #1C1C1F vs #4a4a4b / #666668). `--ring` is overridden in both modes. That is 30 "no token" colour values, the largest single block. `--greenpop1` and `--greenpop4` are swapped relative to fractalstyler.
2. **Off-scale control heights: 28 / 40 / 44px.** Buttons and icon buttons are 28 (between `--height-bs` 24 and `--control-h-bs` 32). Tabs are 40 (`--control-h-lg` 38, Δ +2). All five section and panel headers are 44 (`--control-h-lg` 38, Δ +6; no taller height token exists short of `--header-height` 80).
3. **Off-scale font sizes: 11 and 13px.** Labels and pills use 11 (`--text-xs` 10.72, Δ +0.28). Tabs, nav items and the brand use 13, exactly between `--text-sm` 12 and `--text-md` 14.
4. **Off-scale radii: 6 and 12px.** Segmented items and the brand use 6 (between `--radius-sm` 4 and `--radius-md` 8). Cards use 12 (between `--radius-md` 8 and `--radius-bs` 16).
5. **Off-scale spacing: 2 and 10px.** Button and segment padding-x is 10 (between `--space-sm` 8 and `--space-md` 12). Segment padding/gap and toggle padding are 2 (below `--space-xs` 4).
6. **The toggle has its own geometry**: 30×18 with a 14px knob, against fractalstyler's `--switch-w` 40 / `--switch-h` 22 / `--switch-thumb` 16 (Δ −10 / −4 / −2).
7. **Layout widths have no tokens**: rail 52, MAIN_MIN 420, sidebar min/max ranges, palette 560 / 96 / 320, window sizes. The sidebar defaults sit off fractalstyler's single `--sidebar-width*` 280: left 240 (Δ −40), panel 340 (Δ +60), right 300 (Δ +20).
8. **Hard-coded weights and border widths.** Weight 500 appears 6× and 700 once in `_own.sass`; each matches a `.weight-N` class, but fractalstyler has no weight token to drive. Border widths are 1px (7×) and 2px (the tab underline); fractalstyler has no border-width token.

## `_own.sass` — rules (32 exact · 28 nearest · 9 no token)

| Where | Property | Value | Verdict | fractalstyler token |
|---|---|---|---|---|
| `.wb-label` | font-size | 11px | nearest | `--text-xs` (10.72px, Δ +0.28) |
| `.wb-label` | font-weight | 500 | exact | class `.weight-500` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-icon` | width | 16px | exact | `--height-sm` (16px) |
| `.wb-icon` | height | 16px | exact | `--height-sm` (16px) |
| `.wb-icon-sm` | width | 14px | nearest | `--height-sm` (16px, Δ −2) |
| `.wb-icon-sm` | height | 14px | nearest | `--height-sm` (16px, Δ −2) |
| `.wb-icon-lg` | width | 20px | exact | `--height-md` (20px) |
| `.wb-icon-lg` | height | 20px | exact | `--height-md` (20px) |
| `.wb-icon-btn` | width | 28px | nearest | `--height-bs` (24px, Δ +4) or `--height-lg` (32px, Δ −4), `--control-h-bs` (32px, Δ −4) |
| `.wb-icon-btn` | height | 28px | nearest | `--height-bs` (24px, Δ +4) or `--height-lg` (32px, Δ −4), `--control-h-bs` (32px, Δ −4) |
| `.wb-icon-btn` | border-radius | 8px | exact | `--radius-md` (8px) |
| `.wb-btn` | height | 28px | nearest | `--height-bs` (24px, Δ +4) or `--height-lg` (32px, Δ −4), `--control-h-bs` (32px, Δ −4) |
| `.wb-btn` | padding | 10px | nearest | `--space-sm` (8px, Δ +2) or `--space-md` (12px, Δ −2) |
| `.wb-btn` | border-radius | 8px | exact | `--radius-md` (8px) |
| `.wb-btn` | border-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-btn` | font-size | 12px | exact | `--text-sm` (12px) |
| `.wb-btn` | font-weight | 500 | exact | class `.weight-500` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-tabs` | height | 40px | nearest | `--control-h-lg` (38px, Δ +2) |
| `.wb-tabs` | border-bottom-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-tab` | height | 40px | nearest | `--control-h-lg` (38px, Δ +2) |
| `.wb-tab` | padding | 8px | exact | `--space-sm` (8px) |
| `.wb-tab` | border-bottom-width | 2px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-tab` | font-size | 13px | nearest | `--text-sm` (12px, Δ +1) or `--text-md` (14px, Δ −1) |
| `.wb-tab` | font-weight | 500 | exact | class `.weight-500` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-seg` | padding | 2px | nearest | `--space-xs` (4px, Δ −2) |
| `.wb-seg` | gap | 2px | nearest | `--space-xs` (4px, Δ −2) |
| `.wb-seg` | border-radius | 8px | exact | `--radius-md` (8px) |
| `.wb-seg` | border-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-seg-item` | height | 24px | exact | `--height-bs` (24px) |
| `.wb-seg-item` | padding | 10px | nearest | `--space-sm` (8px, Δ +2) or `--space-md` (12px, Δ −2) |
| `.wb-seg-item` | border-radius | 6px | nearest | `--radius-sm` (4px, Δ +2) or `--radius-md` (8px, Δ −2) |
| `.wb-seg-item` | border-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-seg-item` | font-size | 12px | exact | `--text-sm` (12px) |
| `.wb-seg-item` | font-weight | 500 | exact | class `.weight-500` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-toggle` | width | 30px | nearest | `--switch-w` (40px, Δ −10) |
| `.wb-toggle` | height | 18px | nearest | `--switch-h` (22px, Δ −4) |
| `.wb-toggle` | padding | 2px | nearest | `--space-xs` (4px, Δ −2) |
| `.wb-toggle` | border-radius | 9px | exact | `--radius-full` (9999px: half the height here, so the same pill shape) |
| `.wb-toggle-knob` | width | 14px | nearest | `--switch-thumb` (16px, Δ −2) |
| `.wb-toggle-knob` | height | 14px | nearest | `--switch-thumb` (16px, Δ −2) |
| `.wb-toggle-knob` | border-radius | 7px | exact | `--radius-full` (9999px: half the height here, so the same pill shape) |
| `.wb-pill` | height | 20px | exact | `--height-md` (20px) |
| `.wb-pill` | padding | 8px | exact | `--space-sm` (8px) |
| `.wb-pill` | border-radius | 10px | exact | `--radius-full` (9999px: half the height here, so the same pill shape) |
| `.wb-pill` | border-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-pill` | font-size | 11px | nearest | `--text-xs` (10.72px, Δ +0.28) |
| `.wb-pill` | font-weight | 500 | exact | class `.weight-500` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-card` | padding | 16px | exact | `--space-bs` (16px) |
| `.wb-card` | border-radius | 12px | nearest | `--radius-md` (8px, Δ +4) or `--radius-bs` (16px, Δ −4) |
| `.wb-card` | border-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |
| `.wb-tile` | width | 264px | nearest | `--card-min` (240px, Δ +24) |
| `.wb-panel-header` | height | 44px | nearest | `--control-h-lg` (38px, Δ +6) |
| `.wb-splitter` | width | 5px | nearest | `--space-xs` (4px, Δ +1) |
| `.section-sidebar-left.rail` | width | 52px | no-token | no token exists |
| `.section-sidebar-left-header, .section-sidebar-panel-header, .section-sidebar-right-header, .section-main-header` | height | 44px | nearest | `--control-h-lg` (38px, Δ +6) |
| `.section-main-footer` | height | 24px | exact | `--height-bs` (24px) |
| `.wb-brand` | width | 24px | exact | `--height-bs` (24px) |
| `.wb-brand` | height | 24px | exact | `--height-bs` (24px) |
| `.wb-brand` | border-radius | 6px | nearest | `--radius-sm` (4px, Δ +2) or `--radius-md` (8px, Δ −2) |
| `.wb-brand` | font-size | 13px | nearest | `--text-sm` (12px, Δ +1) or `--text-md` (14px, Δ −1) |
| `.wb-brand` | font-weight | 700 | exact | class `.weight-700` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-nav-item` | height | 32px | exact | `--height-lg` (32px) |
| `.wb-nav-item` | padding | 8px | exact | `--space-sm` (8px) |
| `.wb-nav-item` | border-radius | 8px | exact | `--radius-md` (8px) |
| `.wb-nav-item` | font-size | 13px | nearest | `--text-sm` (12px, Δ +1) or `--text-md` (14px, Δ −1) |
| `.wb-nav-item` | font-weight | 500 | exact | class `.weight-500` (fractalstyler has weight classes 300–800, no weight custom property) |
| `.wb-glyph` | width | 32px | exact | `--height-lg` (32px) |
| `.wb-glyph` | height | 32px | exact | `--height-lg` (32px) |
| `.wb-glyph` | border-width | 1px | no-token | no token exists (fractalstyler writes `1px` literally) |

## `_own.sass` — custom properties (8 exact · 1 nearest · 34 no token)

Colours are compared against fractalstyler's value for the same role in the same mode (`:root` vars against the mode-independent value).

| Where | Property | Value | Verdict | fractalstyler token |
|---|---|---|---|---|
| `:root --greenpop1` | colour | #00e676 | exact | overrides fractalstyler `--greenpop1` (#70e000); equals fractalstyler `--greenpop4` — greenpop1/4 are swapped vs fractalstyler |
| `:root --greenpop2` | colour | #00df89 | exact | same as fractalstyler `--greenpop2` (#00df89) |
| `:root --greenpop3` | colour | #69ff97 | exact | same as fractalstyler `--greenpop3` (#69ff97) |
| `:root --greenpop4` | colour | #70e000 | exact | overrides fractalstyler `--greenpop4` (#00e676); equals fractalstyler `--greenpop1` — greenpop1/4 are swapped vs fractalstyler |
| `:root --on-accent` | colour | #000000 | nearest | `--black-fixed` (#171717; app uses pure #000000) |
| `:root --wb-scrim` | colour | rgba(0, 0, 0, 0.45) | no-token | no token exists (app-only) |
| `:root --wb-palette-width` | size | 560px | no-token | no token exists (palette dialog geometry) |
| `:root --wb-palette-top` | size | 96px | no-token | no token exists (nearest size token `--header-height` 80px, Δ +16, unrelated role) |
| `:root --wb-palette-list` | size | 320px | no-token | no token exists (palette dialog geometry) |
| `light --bg` | colour | #FFFFFF | exact | same as fractalstyler `--bg` (#ffffff) |
| `light --bg-surface` | colour | #FAFAFA | exact | same as fractalstyler `--bg-surface` (#FAFAFA) |
| `light --bg-panel` | colour | #FAFAFA | no-token | overrides fractalstyler `--bg-panel` (#FBFBF9) (app palette override) |
| `light --bg-raised` | colour | #FFFFFF | exact | overrides fractalstyler `--bg-raised` (#F4F4F5); equals fractalstyler `--white-fixed` |
| `light --bg-sunken` | colour | #F5F5F5 | no-token | overrides fractalstyler `--bg-sunken` (#F7F6F0) (app palette override) |
| `light --bg-input` | colour | #FFFFFF | exact | overrides fractalstyler `--bg-input` (#FAF7F7); equals fractalstyler `--white-fixed` |
| `light --bg-extra` | colour | #F5F5F5 | no-token | overrides fractalstyler `--bg-extra` (#F7F8F9) (app palette override) |
| `light --bg-button` | colour | #F5F5F5 | no-token | overrides fractalstyler `--bg-button` (#CED8D3) (app palette override) |
| `light --border` | colour | #EBEBEB | no-token | overrides fractalstyler `--border` (#d8d8d8) (app palette override) |
| `light --border-subtle` | colour | #F2F2F2 | no-token | overrides fractalstyler `--border-subtle` (#eceaea) (app palette override) |
| `light --border-strong` | colour | #DCDCDE | no-token | overrides fractalstyler `--border-strong` (#cfcfcf) (app palette override) |
| `light --state-hover` | colour | #F4F4F5 | no-token | overrides fractalstyler `--state-hover` (#ECE7DF) (app palette override) |
| `light --state-selected` | colour | #EDEDEF | no-token | overrides fractalstyler `--state-selected` (#E4DFD5) (app palette override) |
| `light --text-primary` | colour | #111113 | no-token | overrides fractalstyler `--text-primary` (#262627) (app palette override) |
| `light --text-secondary` | colour | #6B6B70 | no-token | overrides fractalstyler `--text-secondary` (#777777) (app palette override) |
| `light --text-muted` | colour | #A1A1A6 | no-token | overrides fractalstyler `--text-muted` (#a3a4a7) (app palette override) |
| `light --ring` | colour | rgba(0, 230, 118, 0.45) | no-token | overrides fractalstyler `--ring` (rgba(0, 127, 78, 0.35)) (app palette override) |
| `dark --bg` | colour | #000000 | no-token | overrides fractalstyler `--bg` (#101010) (app palette override) |
| `dark --bg-surface` | colour | #0A0A0A | no-token | overrides fractalstyler `--bg-surface` (#202021) (app palette override) |
| `dark --bg-panel` | colour | #0A0A0A | no-token | overrides fractalstyler `--bg-panel` (#1f1f20) (app palette override) |
| `dark --bg-raised` | colour | #111111 | no-token | overrides fractalstyler `--bg-raised` (#3a3a3a) (app palette override) |
| `dark --bg-sunken` | colour | #0D0D0D | no-token | overrides fractalstyler `--bg-sunken` (#1f1f20) (app palette override) |
| `dark --bg-input` | colour | #0D0D0D | no-token | overrides fractalstyler `--bg-input` (#1c1c1d) (app palette override) |
| `dark --bg-extra` | colour | #0A0A0A | no-token | overrides fractalstyler `--bg-extra` (#111111) (app palette override) |
| `dark --bg-button` | colour | #111111 | no-token | overrides fractalstyler `--bg-button` (#171818) (app palette override) |
| `dark --border` | colour | #1F1F1F | no-token | overrides fractalstyler `--border` (#2f2f2f) (app palette override) |
| `dark --border-subtle` | colour | #161616 | no-token | overrides fractalstyler `--border-subtle` (#1e1e1f) (app palette override) |
| `dark --border-strong` | colour | #2C2C2E | no-token | overrides fractalstyler `--border-strong` (#7c7c7c) (app palette override) |
| `dark --state-hover` | colour | #151517 | no-token | overrides fractalstyler `--state-hover` (#4a4a4b) (app palette override) |
| `dark --state-selected` | colour | #1C1C1F | no-token | overrides fractalstyler `--state-selected` (#666668) (app palette override) |
| `dark --text-primary` | colour | #EDEDED | no-token | overrides fractalstyler `--text-primary` (#EDF2F7) (app palette override) |
| `dark --text-secondary` | colour | #A1A1A1 | no-token | overrides fractalstyler `--text-secondary` (#c7c7c7) (app palette override) |
| `dark --text-muted` | colour | #6B6B6B | no-token | overrides fractalstyler `--text-muted` (#7c7c7c) (app palette override) |
| `dark --ring` | colour | rgba(0, 230, 118, 0.45) | no-token | overrides fractalstyler `--ring` (rgba(16, 185, 129, 0.4)) (app palette override) |

## TS and script constants (1 exact · 3 nearest · 8 no token)

| Where | Property | Value | Verdict | fractalstyler token |
|---|---|---|---|---|
| `kernel/layout` sidebar-left default | width | 240px | nearest | `--sidebar-width-left` (280px, Δ −40) |
| `kernel/layout` sidebar-panel default | width | 340px | nearest | `--sidebar-width` (280px, Δ +60) |
| `kernel/layout` sidebar-right default | width | 300px | nearest | `--sidebar-width-right` (280px, Δ +20) |
| `kernel/layout` sidebar-left min / max | width | 200 / 360px | no-token | no token exists (layout constant) |
| `kernel/layout` sidebar-panel min / max | width | 280 / 520px | no-token | no token exists (layout constant) |
| `kernel/layout` sidebar-right min / max | width | 260 / 420px | no-token | no token exists (layout constant) |
| `kernel/layout` RAIL (collapsed left) | width | 52px | no-token | no token exists (layout constant) |
| `kernel/layout` MAIN_MIN | width | 420px | no-token | no token exists (layout constant) |
| `app.ts` window | width × height | 1440 × 860px | no-token | no token exists (layout constant) |
| `kernel/window` initial size | width × height | 1100 × 720px | no-token | no token exists (layout constant) |
| `CssToSass.svelte` textarea chrome allowance | height | 240px | no-token | no token exists (layout constant) |
| `Shell / Sidebar / SidebarLeft` inline `style` | width | `${width}px` (from kernel/layout) | no-token | not a literal: carries the kernel/layout widths above |
| `CssToSass.svelte` textarea row | height | 20px | exact | `--height-md` (20px), coincidentally: this is GPUI's textarea row height, not ours |

## fractalstyler token scales (flattened px)

**Text** (`--text-scaling` 1.25, base `--text-bs` 16)

| Token | px |
|---|---|
| `--text-xs` | 10.72px |
| `--text-sm` | 12px |
| `--text-md` | 14px |
| `--text-bs` | 16px |
| `--text-lg` | 20px |
| `--text-xl` | 25px |
| `--text-2xl` | 31.25px |
| `--text-3xl` | 39.063px |
| `--text-4xl` | 48.828px |
| `--text-5xl` | 61.035px |

**Spacing** (`--unit-space` 4)

| Token | px |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 12px |
| `--space-bs` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |
| `--space-3xl` | 64px |

**Radius**

| Token | px |
|---|---|
| `--radius-xs` | 2px |
| `--radius-sm` | 4px |
| `--radius-md` | 8px |
| `--radius-bs` | 16px |
| `--radius-lg` | 32px |
| `--radius-full` | 9999px |

**Heights and controls**

| Token | px |
|---|---|
| `--height-sm` | 16px |
| `--height-md` | 20px |
| `--height-bs` | 24px |
| `--height-lg` | 32px |
| `--control-h-sm` | 21px |
| `--control-h-bs` | 32px |
| `--control-h-lg` | 38px |
| `--avatar-size` | 32px |
| `--switch-w` | 40px |
| `--switch-h` | 22px |
| `--switch-thumb` | 16px |

**Layout**

| Token | value |
|---|---|
| `--header-height` | 80px |
| `--footer-height` | 32px |
| `--fit-height` | 112px |
| `--sidebar-width` | 280px |
| `--sidebar-width-left` | 280px |
| `--sidebar-width-right` | 280px |
| `--card-min` | 240px |
| `--app-inline` | 24px |
| `--content-clamp` | 1600px |
| `--prose-clamp` | 65ch |

**Weights and line-height.** fractalstyler has no custom properties for these. Weights exist only as classes, `.weight-300` to `.weight-800`. Line-heights exist as unitless classes (`.lh11`–`.lh16`, plus 1.1–1.5 baked into `.text-body*`, `.nav-link*` and the headings); GPUI drops unitless line-height (see `css-learn.md`). `_own.sass` sets no line-height.

**Colour roles** (light / dark)

| Token | light / dark |
|---|---|
| `--bg` | #ffffff / #101010 |
| `--bg-surface` | #FAFAFA / #202021 |
| `--bg-panel` | #FBFBF9 / #1f1f20 |
| `--bg-sunken` | #F7F6F0 / #1f1f20 |
| `--bg-raised` | #F4F4F5 / #3a3a3a |
| `--bg-extra` | #F7F8F9 / #111111 |
| `--bg-input` | #FAF7F7 / #1c1c1d |
| `--bg-button` | #CED8D3 / #171818 |
| `--text-primary` | #262627 / #EDF2F7 |
| `--text-secondary` | #777777 / #c7c7c7 |
| `--text-muted` | #a3a4a7 / #7c7c7c |
| `--state-hover` | #ECE7DF / #4a4a4b |
| `--state-selected` | #E4DFD5 / #666668 |
| `--border` | #d8d8d8 / #2f2f2f |
| `--border-subtle` | #eceaea / #1e1e1f |
| `--border-strong` | #cfcfcf / #7c7c7c |
| `--theme-color` | #ff4400 / #2F9E44 |
| `--ring` | rgba(0, 127, 78, 0.35) / rgba(16, 185, 129, 0.4) |

Status families: `--success`, `--success-hover`, `--warning`, `--warning-hover`, `--danger`, `--danger-hover`, `--info`, `--info-hover`. Fixed: `--white-fixed` #FFFFFF, `--black-fixed` #171717; accents `--greenpop1–4`, `--orangepop1–6`.

## Proposed named steps for the live editor (existing tokens only)

Each named step chooses which existing token a UI role reads. No token is added, and no token value changes. "Today" shows where the app sits now, snapped to the nearest token.

**Text: small / regular / large**

| Role (current classes) | small | regular (≈ today) | large |
|---|---|---|---|
| caption: `.wb-label`, `.wb-pill`, status bar (11px today) | `--text-xs` 10.72 | `--text-xs` 10.72 | `--text-sm` 12 |
| control: `.wb-btn`, `.wb-seg-item`, `.wb-tab`, `.wb-nav-item`, brand (12–13px today) | `--text-xs` 10.72 | `--text-sm` 12 | `--text-md` 14 |
| body / code: editor, lists (`text-sm` today) | `--text-sm` 12 | `--text-sm` 12 | `--text-md` 14 |
| title: panel header, card title (`text-sm`/`text-md` weight-600 today) | `--text-sm` 12 | `--text-md` 14 | `--text-bs` 16 |

**Density: tight / compact / spacious**

| Role | tight | compact (≈ today) | spacious |
|---|---|---|---|
| inner gap (segment, icon + label) | `--space-xs` 4 | `--space-xs` 4 | `--space-sm` 8 |
| control padding-x (btn, seg, tab, nav, pill: 8–10 today) | `--space-xs` 4 | `--space-sm` 8 | `--space-md` 12 |
| container padding (card 16 today; `pad-*` classes) | `--space-sm` 8 | `--space-md` 12 → `--space-bs` 16 | `--space-lg` 24 |
| between-blocks gap (`gap-*` classes) | `--space-sm` 8 | `--space-md` 12 | `--space-bs` 16 |
| small control height (seg item, pill: 20–24) | `--height-md` 20 | `--height-bs` 24 | `--height-lg` 32 |
| control / row height (btn, icon-btn, nav item: 28–32) | `--height-bs` 24 | `--control-h-bs` 32 | `--control-h-lg` 38 |
| section / tab-bar header height (40–44 today) | `--control-h-bs` 32 | `--control-h-lg` 38 | `--control-h-lg` 38 (no taller token below `--header-height` 80) |

**Optional — corners: sharp / soft / round**: control radius `--radius-xs` 2 / `--radius-sm` 4 / `--radius-md` 8; card radius `--radius-sm` 4 / `--radius-md` 8 / `--radius-bs` 16; pills and toggles always `--radius-full`.

**Not stepped.** Colours already resolve through the role tokens, so the theme (light/dark) is the only switch. Weights have no token; keep the `.weight-500` / `.weight-600` / `.weight-700` classes. Border widths stay at 1px. Layout widths (rail, sidebar ranges, MAIN_MIN, palette geometry, window) stay app constants. Only the sidebar defaults could optionally snap to `--sidebar-width*` 280.

**Consequences of snapping to these tokens:**
- 28px buttons become 24 or 32.
- 40/44px headers become 38.
- 13px control text becomes 12 or 14.
- 6/12px radii become 4/8/16.
- 10px padding becomes 8 or 12.
- 2px segment padding becomes 4 (or stays as a 1-off).
- The toggle grows to fractalstyler's 40×22 switch with a 16px thumb.
