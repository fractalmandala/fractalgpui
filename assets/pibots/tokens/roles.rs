//! Role mappings: WHICH step each kind of thing uses. UI code asks for a role, never for a number.
use crate::control::{ControlStyle, Shape, Size, Variant};
use crate::ladder::{self, Step};

#[derive(Clone, Copy, Debug)]
pub struct Role {
    pub name: &'static str,
    pub uses: &'static str,
    pub height: Option<Step>,
    /// SPECIAL-CASE radius override (tiny chips, button-group outer corners, switch). `None` for every normal component.
    pub radius: Option<Step>,
    /// true: the corner radius is the ONE active shape preset (universal). false: flush/docked, or an explicit `radius` override.
    pub shaped: bool,
    pub text: Option<Step>,
    pub pad: Option<Step>,
    pub gap: Option<Step>,
    pub bold: bool,
}
impl Role {
    pub fn height_px(&self) -> f32 { self.height.map_or(0.0, ladder::height) }
    /// Radius under the given active shape (override wins, flush roles are 0).
    pub fn radius_px(&self, shape: crate::control::Shape) -> f32 {
        if let Some(s) = self.radius { ladder::radius(s) } else if self.shaped { shape.surface_radius() } else { 0.0 }
    }
    pub fn text_px(&self) -> f32 { self.text.map_or(ladder::text(Step::Md), ladder::text) }
    pub fn pad_px(&self) -> f32 { self.pad.map_or(0.0, ladder::space) }
    pub fn gap_px(&self) -> f32 { self.gap.map_or(0.0, ladder::space) }
}

const fn r(name: &'static str, uses: &'static str, height: Option<Step>, radius: Option<Step>, text: Option<Step>, pad: Option<Step>, gap: Option<Step>, bold: bool) -> Role {
    // shaped = no explicit radius override AND not a flush/docked surface (PANEL, headers, lines, labels, body text)
    let flush = matches!(name.as_bytes(), b"panel" | b"panel-title" | b"section-label" | b"body" | b"label" | b"caption" | b"status-line" | b"header");
    Role { name, uses, height, radius, shaped: radius.is_none() && !flush, text, pad, gap, bold }
}
use Step::*;

pub const BUTTON: Role = r("button", "default button", Some(Bs), None, Some(Md), None, Some(Sm), false);
pub const BUTTON_COMPACT: Role = r("button-compact", "tabs, toolbar and row actions, the header model trigger, icon buttons", Some(Sm), None, Some(Sm), None, Some(Xs), false);
pub const INPUT: Role = r("input", "text fields, masked keys, search", Some(Bs), None, Some(Md), None, None, false);
pub const SELECT: Role = r("select", "dropdown trigger", Some(Bs), None, Some(Md), None, None, false);
pub const CARD: Role = r("card", "provider cards, profile entries", None, None, Some(Md), Some(Md), Some(Sm), false);
pub const PANEL: Role = r("panel", "side sheet body", None, None, Some(Md), Some(Md), Some(Md), false);
pub const PANEL_TITLE: Role = r("panel-title", "sheet and section titles", None, None, Some(Bs), None, None, true);
pub const SECTION_LABEL: Role = r("section-label", "UPPERCASE group heading in forms", None, None, Some(Xs), None, None, true);
pub const BODY: Role = r("body", "transcript and form text", None, None, Some(Md), None, None, false);
pub const LABEL: Role = r("label", "field and list labels, button text", None, None, Some(Sm), None, None, false);
pub const CAPTION: Role = r("caption", "hints, counts, timestamps, badges", None, None, Some(Xs), None, Some(Xs), false);
pub const LIST_ROW: Role = r("list-row", "checklist and picker rows", Some(Md), None, Some(Sm), Some(Sm), Some(Sm), false);
pub const BADGE: Role = r("badge", "NEW / REMOVED / status tags (tiny chip: special-case radius xs)", Some(Xs), Some(Xs), Some(Xs), Some(Xs), None, true);
pub const STATUS_LINE: Role = r("status-line", "the cue line under a sheet header", Some(Sm), None, Some(Sm), Some(Sm), Some(Sm), false);
pub const BUBBLE: Role = r("chat-bubble", "user and agent messages", None, None, Some(Md), Some(Md), Some(Sm), false);
pub const TOOL_CARD: Role = r("tool-card", "tool call + result card", None, None, Some(Sm), Some(Sm), Some(Xs), false);
pub const APPROVAL_CARD: Role = r("approval-card", "pending approval inline card", None, None, Some(Sm), Some(Md), Some(Sm), false);
pub const CODE_BLOCK: Role = r("code-block", "code and tool output (mono)", None, None, Some(Sm), Some(Sm), None, false);
pub const DROPDOWN: Role = r("dropdown", "model picker / popover panel", None, None, Some(Sm), Some(Xs), Some(Xs), false);
pub const DIALOG: Role = r("dialog", "approval / confirm dialogs", None, None, Some(Md), Some(Lg), Some(Md), false);
pub const HEADER: Role = r("header", "window header / chat header bar", Some(Lg), None, Some(Sm), Some(Sm), Some(Sm), false);

pub const ALL: &[Role] = &[BUTTON, BUTTON_COMPACT, INPUT, SELECT, CARD, PANEL, PANEL_TITLE, SECTION_LABEL, BODY, LABEL, CAPTION, LIST_ROW, BADGE, STATUS_LINE, BUBBLE, TOOL_CARD, APPROVAL_CARD, CODE_BLOCK, DROPDOWN, DIALOG, HEADER];

/// The app-wide default control shape.
pub const DEFAULT_SHAPE: Shape = Shape::Curved;
pub const fn default_button() -> ControlStyle { ControlStyle::new(Variant::Secondary, DEFAULT_SHAPE, Size::Bs) }
pub const fn compact_button() -> ControlStyle { ControlStyle::new(Variant::Ghost, DEFAULT_SHAPE, Size::Sm) }
pub const fn input() -> ControlStyle { ControlStyle::new(Variant::Secondary, DEFAULT_SHAPE, Size::Bs) }
pub const fn select() -> ControlStyle { ControlStyle::new(Variant::Outline, DEFAULT_SHAPE, Size::Bs) }
