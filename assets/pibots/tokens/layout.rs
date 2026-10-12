//! Layout constants that are not on a ladder (widths of structural regions). The ONLY place for such numbers.
use crate::ladder::{self, Step};

/// Smallest window the app supports; below it nothing is guaranteed to fit.
pub const MIN_WINDOW: (f32, f32) = (720.0, 480.0);
pub const DEFAULT_WINDOW: (f32, f32) = (1100.0, 720.0);
/// The chat view's minimum width (also the dock's Main-zone minimum).
pub const CHAT_MIN_WIDTH: f32 = 240.0;
/// Header model dropdown.
pub const DROPDOWN_WIDTH: f32 = 340.0;
pub const DROPDOWN_MIN_WIDTH: f32 = 220.0;
pub const DROPDOWN_MAX_HEIGHT_MARGIN: f32 = 120.0;
/// Live browser mirror in the info column.
pub const BROWSER_FRAME_HEIGHT: f32 = 180.0;
pub const BROWSER_EMPTY_HEIGHT: f32 = 60.0;
/// Zoom/detail pane under a list.
pub const DETAIL_MAX_HEIGHT: f32 = 170.0;
/// Label column widths in typed forms.
pub const FORM_LABEL_WIDTH: f32 = 84.0;
pub const FORM_LABEL_WIDE: f32 = 150.0;
pub const FORM_VALUE_WIDTH: f32 = 80.0;
pub const FORM_NUMBER_WIDTH: f32 = 64.0;
/// Header dropdown anchor offset from the top.
pub const DROPDOWN_TOP: f32 = WINDOW_STRIP_HEIGHT;

/// List rows (checklists, pickers) are control-height `md`.
pub const ROW_HEIGHT: f32 = ladder::HEIGHT.px[Step::Md as usize] as f32;
/// Below this window width the header drops the run-state text and the "Model:"/theme labels so every control stays visible.
pub const COMPACT_HEADER_BELOW: f32 = 640.0;

// ---- shell: sidebar strip, window strip, dock ----
/// The left sidebar strip (macOS traffic lights at the top, navigation icons, bot switcher, settings, theme toggle).
/// Every icon (public/icons/*.svg) is drawn ICON_SIZE x ICON_SIZE, tinted by the text color of its container.
pub const ICON_SIZE: f32 = 16.0;
/// Width of the compact usage bar next to the model trigger (header).
pub const USAGE_BAR_WIDTH: f32 = 48.0;
/// The usage bar turns amber / red above these fractions of the limit.
pub const USAGE_WARN_FRACTION: f32 = 0.8;
pub const USAGE_DANGER_FRACTION: f32 = 0.95;
pub const SIDEBAR_WIDTH: f32 = 80.0;
/// Full-width transparent strip at the top of the window: the drag region (double-click = zoom). Controls placed in it stay clickable.
pub const WINDOW_STRIP_HEIGHT: f32 = 32.0;
/// Native traffic-light position inside the sidebar strip (macOS; ignored elsewhere).
pub const TRAFFIC_LIGHT_POS: (f32, f32) = (14.0, 10.0);
/// Smallest pane a dock view may be squeezed to by a divider (width / height). Below its own `min_size` a pane collapses to its icon later.
pub const PANE_MIN_WIDTH: f32 = 280.0;
pub const PANE_MIN_HEIGHT: f32 = 160.0;
/// Divider hit area (px) between dock panes; the visible line is a hairline.
pub const DIVIDER_THICKNESS: f32 = 6.0;
/// Fraction of a pane's size that is an edge drop zone when dragging a tab over it.
pub const DROP_EDGE_FRACTION: f32 = 0.25;
/// Delay-free drag threshold before a tab press becomes a drag (px).
pub const DRAG_THRESHOLD: f32 = 6.0;
/// Below this window height the sidebar shows icons only (no captions, no bot name) so everything fits at the 480px minimum.
pub const SIDEBAR_COMPACT_BELOW_HEIGHT: f32 = 600.0;
/// A tab group narrower than this shows short tab titles ("Models" instead of "Providers & models").
pub const TAB_TITLES_SHORT_BELOW: f32 = 440.0;
