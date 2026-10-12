//! Motion durations (ms), shadow steps and z-layers.

pub const INSTANT_MS: u32 = 50;
pub const FAST_MS: u32 = 90;
pub const BASE_MS: u32 = 140;
pub const SLOW_MS: u32 = 220;
pub const DURATIONS_MS: [(&str, u32, &str); 4] = [
    ("instant", INSTANT_MS, "press feedback, checkbox ticks"),
    ("fast", FAST_MS, "hover, focus ring"),
    ("base", BASE_MS, "dropdowns, tab switches"),
    ("slow", SLOW_MS, "sheets sliding, toasts"),
];

/// How long a status cue stays (the `Notice` TTLs in pibots-client mirror these).
pub const NOTICE_OK_SECS: u64 = 5;
pub const NOTICE_WARN_SECS: u64 = 10;
pub const NOTICE_ERROR_SECS: u64 = 12;

/// Stacking order. Higher paints over lower.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Z { Base = 0, Sticky = 10, Sheet = 20, Dropdown = 30, Dialog = 40, Toast = 50, Tooltip = 60 }
pub const Z_LAYERS: [(&str, Z, &str); 7] = [
    ("base", Z::Base, "transcript, composer"),
    ("sticky", Z::Sticky, "fixed headers/footers inside a scroller"),
    ("sheet", Z::Sheet, "side sheets (Providers, Bot)"),
    ("dropdown", Z::Dropdown, "model picker, selects, popovers"),
    ("dialog", Z::Dialog, "approval and confirm dialogs"),
    ("toast", Z::Toast, "transient notices"),
    ("tooltip", Z::Tooltip, "tooltips"),
];
