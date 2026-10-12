//! Light and dark palettes. Roles, not raw colors: UI code asks for `p.panel`, never for a hex.
use crate::color::Rgba;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode { Dark, Light }
impl Mode {
    pub const fn name(self) -> &'static str { match self { Mode::Dark => "dark", Mode::Light => "light" } }
    pub const fn toggled(self) -> Mode { match self { Mode::Dark => Mode::Light, Mode::Light => Mode::Dark } }
    pub fn palette(self) -> &'static Palette { match self { Mode::Dark => &DARK, Mode::Light => &LIGHT } }
    pub fn parse(s: &str) -> Option<Mode> { match s.trim().to_ascii_lowercase().as_str() { "dark" => Some(Mode::Dark), "light" => Some(Mode::Light), _ => None } }
}

/// A status color with its hover pair.
#[derive(Clone, Copy, Debug)]
pub struct Status { pub base: Rgba, pub hover: Rgba }

#[derive(Clone, Copy, Debug)]
pub struct Palette {
    pub mode: Mode,
    // ---- surface ramp ----
    /// app background (the chat column)
    pub bg: Rgba,
    /// sidebars, header, footer, side sheets
    pub surface: Rgba,
    /// cards, popovers, dropdowns
    pub panel: Rgba,
    pub button: Rgba,
    pub input: Rgba,
    pub sunken: Rgba,
    pub raised: Rgba,
    pub extra: Rgba,
    pub state_surface: Rgba,
    pub state_hover: Rgba,
    pub state_selected: Rgba,
    // ---- ink ----
    pub text_primary: Rgba,
    pub text_secondary: Rgba,
    pub text_muted: Rgba,
    pub text_inverse: Rgba,
    // ---- borders ----
    pub border: Rgba,
    pub border_subtle: Rgba,
    pub border_strong: Rgba,
    // ---- theme color (green family) ----
    pub theme: Rgba,
    pub theme_alt: Rgba,
    pub theme_sub: Rgba,
    /// ink on top of `theme`
    pub on_theme: Rgba,
    // ---- status ----
    pub success: Status,
    pub warning: Status,
    pub danger: Status,
    pub info: Status,
    /// ink on top of a status fill
    pub on_status: Rgba,
    pub ring: Rgba,
    /// scrim behind dialogs
    pub overlay: Rgba,
    /// fixed (mode independent) white and black from the reference
    pub white_fixed: Rgba,
    pub black_fixed: Rgba,
    pub accent_orange: Rgba,
    pub accent_green: Rgba,
    /// inner top highlight of raised surfaces (inset 0 1px 0)
    pub shadow_rim: Rgba,
    /// dark mode only: the deep shadow color of the reference (`rgb(0 0 0 / .60)`)
    pub shadow_umbra: Option<Rgba>,
    /// text-safe variants of the status colors (identical to the base in dark; darker in light where the base fails contrast as text)
    pub success_text: Rgba,
    pub warning_text: Rgba,
    pub danger_text: Rgba,
    pub info_text: Rgba,
    /// dark ink for text on the theme green (the accessible alternative to the reference's white-fixed)
    pub on_theme_accessible: Rgba,
    // ---- pibots-specific ----
    pub user_bubble_bg: Rgba,
    pub user_bubble_fg: Rgba,
    pub agent_bubble_bg: Rgba,
    pub agent_bubble_fg: Rgba,
    pub agent_bubble_border: Rgba,
    pub tool_card_bg: Rgba,
    pub approval_bg: Rgba,
    pub code_bg: Rgba,
    pub code_fg: Rgba,
    pub scrollbar_track: Rgba,
    pub scrollbar_thumb: Rgba,
    pub scrollbar_thumb_hover: Rgba,
    pub selection_bg: Rgba,
    pub destructive_confirm_bg: Rgba,
    pub destructive_confirm_fg: Rgba,
    pub destructive_confirm_border: Rgba,
}

const fn st(base: u32, hover: u32) -> Status { Status { base: Rgba::hex(base), hover: Rgba::hex(hover) } }
const fn c(v: u32) -> Rgba { Rgba::hex(v) }

pub const DARK: Palette = Palette {
    mode: Mode::Dark,
    bg: c(0x121214), surface: c(0x1C1C20), panel: c(0x1E1E22), button: c(0x32323A), input: c(0x27272C),
    sunken: c(0x27272C), raised: c(0x36363D), extra: c(0x161618),
    state_surface: c(0x27272C), state_hover: c(0x33333C), state_selected: c(0x3E3E4A),
    text_primary: c(0xF4F4F6), text_secondary: c(0x9D9DA8), text_muted: c(0x63636E), text_inverse: c(0x121214),
    border: c(0x2E2E36), border_subtle: c(0x222228), border_strong: c(0x44444E),
    theme: c(0x22C55E), theme_alt: c(0x00DF89), theme_sub: c(0x10B981), on_theme: c(0xFFFFFF),
    success: st(0x22C55E, 0x34D399), warning: st(0xFFD000, 0xFCD34D), danger: st(0xEF4444, 0xF87171), info: st(0x60A5FA, 0x93C5FD),
    on_status: c(0x121214),
    ring: Rgba::hex(0xFFD000).with_alpha_pm(450),
    overlay: Rgba::hex(0x000000).with_alpha_pct(60),
    white_fixed: c(0xFFFFFF), black_fixed: c(0x18181B), accent_orange: c(0xFF7A00), accent_green: c(0x22C55E),
    shadow_rim: Rgba::hex(0xFFFFFF).with_alpha_pm(80), shadow_umbra: Some(Rgba::hex(0x000000).with_alpha_pm(600)),
    success_text: c(0x22C55E), warning_text: c(0xFFD000), danger_text: c(0xF87171), info_text: c(0x60A5FA), on_theme_accessible: c(0x0B1F13),
    user_bubble_bg: c(0x17402B), user_bubble_fg: c(0xF4F4F6),
    agent_bubble_bg: c(0x1E1E22), agent_bubble_fg: c(0xF4F4F6), agent_bubble_border: c(0x2E2E36),
    tool_card_bg: c(0x161618),
    approval_bg: c(0x2A2508),
    code_bg: c(0x161618), code_fg: c(0xE4E4E8),
    scrollbar_track: Rgba::TRANSPARENT, scrollbar_thumb: c(0x44444E), scrollbar_thumb_hover: c(0x63636E),
    selection_bg: Rgba::hex(0x22C55E).with_alpha_pct(35),
    destructive_confirm_bg: c(0x3A1517), destructive_confirm_fg: c(0xFCA5A5), destructive_confirm_border: c(0xEF4444),
};

pub const LIGHT: Palette = Palette {
    mode: Mode::Light,
    bg: c(0xFFFFFF), surface: c(0xFFFFFF), panel: c(0xFFFFFF), button: c(0xECEEF1), input: c(0xF0F1F3),
    sunken: c(0xFFFFFF), raised: c(0xFFFFFF), extra: c(0xFFFFFF),
    state_surface: c(0xFFFFFF), state_hover: c(0xECEEF1), state_selected: c(0xE2E4E8),
    text_primary: c(0x18181B), text_secondary: c(0x6B7280), text_muted: c(0x9CA3AF), text_inverse: c(0xFFFFFF),
    border: c(0xE5E7EB), border_subtle: c(0xF0F1F3), border_strong: c(0xD1D5DB),
    theme: c(0x22C55E), theme_alt: c(0x00DF89), theme_sub: c(0x10B981), on_theme: c(0xFFFFFF),
    success: st(0x10B981, 0x059669), warning: st(0xFFD000, 0xE5B800), danger: st(0xEF4444, 0xDC2626), info: st(0x3B82F6, 0x2563EB),
    on_status: c(0xFFFFFF),
    ring: Rgba::hex(0xFFD000).with_alpha_pm(400),
    overlay: Rgba::hex(0x18181B).with_alpha_pct(40),
    white_fixed: c(0xFFFFFF), black_fixed: c(0x18181B), accent_orange: c(0xFF7A00), accent_green: c(0x10B981),
    shadow_rim: Rgba::hex(0xFFFFFF).with_alpha_pm(600), shadow_umbra: None,
    // NOT in the reference: darker text-safe variants (the reference status fills fail contrast as text on white)
    success_text: c(0x047857), warning_text: c(0x854D0E), danger_text: c(0xB91C1C), info_text: c(0x2563EB), on_theme_accessible: c(0x0B1F13),
    user_bubble_bg: c(0xFFFFFF), user_bubble_fg: c(0x18181B),
    agent_bubble_bg: c(0xFFFFFF), agent_bubble_fg: c(0x18181B), agent_bubble_border: c(0xE5E7EB),
    tool_card_bg: c(0xFFFFFF),
    approval_bg: c(0xFFFFFF),
    code_bg: c(0xEAECEF), code_fg: c(0x18181B),
    scrollbar_track: Rgba::TRANSPARENT, scrollbar_thumb: c(0xD1D5DB), scrollbar_thumb_hover: c(0x9CA3AF),
    selection_bg: Rgba::hex(0x22C55E).with_alpha_pct(30),
    destructive_confirm_bg: c(0xFEE2E2), destructive_confirm_fg: c(0xB91C1C), destructive_confirm_border: c(0xEF4444),
};

impl Palette {
    /// (token name, color) for every color token, in document order (used by the docs generator and tests).
    pub fn entries(&self) -> Vec<(&'static str, Rgba)> {
        vec![
            ("bg", self.bg), ("bg-surface", self.surface), ("bg-panel", self.panel), ("bg-button", self.button), ("bg-input", self.input),
            ("bg-sunken", self.sunken), ("bg-raised", self.raised), ("bg-extra", self.extra),
            ("state-surface", self.state_surface), ("state-hover", self.state_hover), ("state-selected", self.state_selected),
            ("text-primary", self.text_primary), ("text-secondary", self.text_secondary), ("text-muted", self.text_muted), ("text-inverse", self.text_inverse),
            ("border", self.border), ("border-subtle", self.border_subtle), ("border-strong", self.border_strong),
            ("theme", self.theme), ("theme-alt", self.theme_alt), ("theme-sub", self.theme_sub), ("on-theme", self.on_theme),
            ("success", self.success.base), ("success-hover", self.success.hover),
            ("warning", self.warning.base), ("warning-hover", self.warning.hover),
            ("danger", self.danger.base), ("danger-hover", self.danger.hover),
            ("info", self.info.base), ("info-hover", self.info.hover), ("on-status", self.on_status),
            ("ring", self.ring), ("overlay", self.overlay),
            ("white-fixed", self.white_fixed), ("black-fixed", self.black_fixed), ("accent-orange", self.accent_orange), ("accent-green", self.accent_green), ("shadow-rim", self.shadow_rim),
            ("success-text", self.success_text), ("warning-text", self.warning_text), ("danger-text", self.danger_text), ("info-text", self.info_text),
            ("user-bubble-bg", self.user_bubble_bg), ("user-bubble-fg", self.user_bubble_fg),
            ("agent-bubble-bg", self.agent_bubble_bg), ("agent-bubble-fg", self.agent_bubble_fg), ("agent-bubble-border", self.agent_bubble_border),
            ("tool-card-bg", self.tool_card_bg),
            ("approval-bg", self.approval_bg),
            ("code-bg", self.code_bg), ("code-fg", self.code_fg),
            ("scrollbar-track", self.scrollbar_track), ("scrollbar-thumb", self.scrollbar_thumb), ("scrollbar-thumb-hover", self.scrollbar_thumb_hover),
            ("selection-bg", self.selection_bg),
            ("destructive-confirm-bg", self.destructive_confirm_bg), ("destructive-confirm-fg", self.destructive_confirm_fg), ("destructive-confirm-border", self.destructive_confirm_border),
        ]
    }
}
