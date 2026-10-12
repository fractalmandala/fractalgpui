//! Control style axes: Variant x Shape x Size (+ card Pad). One `ControlStyle` drives every button, input and select.
use crate::color::Rgba;
use crate::ladder::{self, Step};
use crate::palette::Palette;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Variant { Primary, Secondary, Soft, Outline, Ghost, Link, Destructive, IconBox }
impl Variant {
    pub const ALL: [Variant; 8] = [Variant::Primary, Variant::Secondary, Variant::Soft, Variant::Outline, Variant::Ghost, Variant::Link, Variant::Destructive, Variant::IconBox];
    pub const fn name(self) -> &'static str {
        match self { Variant::Primary => "primary", Variant::Secondary => "secondary", Variant::Soft => "soft", Variant::Outline => "outline", Variant::Ghost => "ghost", Variant::Link => "link", Variant::Destructive => "destructive", Variant::IconBox => "iconbox" }
    }
    pub const fn usage(self) -> &'static str {
        match self {
            Variant::Primary => "the one main action of a view (Save key, Add provider, Send)",
            Variant::Secondary => "ordinary actions (Test, Edit models)",
            Variant::Soft => "tinted, low emphasis actions inside cards",
            Variant::Outline => "alternatives next to a primary (Select all visible, Clear)",
            Variant::Ghost => "toolbar/tab/row actions, closing (✕)",
            Variant::Link => "inline navigation",
            Variant::Destructive => "removing or overwriting (Remove key, Remove provider)",
            Variant::IconBox => "square icon-only button; ghost colors, width = height",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shape { Square, Modern, Curved, Round }
impl Shape {
    pub const ALL: [Shape; 4] = [Shape::Square, Shape::Modern, Shape::Curved, Shape::Round];
    pub const fn name(self) -> &'static str { match self { Shape::Square => "square", Shape::Modern => "modern", Shape::Curved => "curved", Shape::Round => "round" } }
    /// Radius ladder step (None = 0).
    pub const fn step(self) -> Option<Step> { match self { Shape::Square => None, Shape::Modern => Some(Step::Sm), Shape::Curved => Some(Step::Md), Shape::Round => Some(Step::Xxl) } }
    pub const fn radius(self) -> f32 { match self.step() { None => 0.0, Some(s) => ladder::radius(s) } }
    /// Radius for large surfaces (cards, panels, bubbles): the active shape, but a pill is capped at the `xl` step so a tall
    /// surface never becomes a stadium. Controls use [`ControlStyle::radius`] (pill = half the height) instead.
    pub const fn surface_radius(self) -> f32 {
        let r = self.radius();
        let cap = ladder::radius(Step::Xl);
        if r > cap { cap } else { r }
    }
}

/// Size presets: control height step + text step + horizontal padding step.
/// sm 24/12px (compact), md 28/12px, bs 32/14px (default control), lg 40/16px. Icon buttons are square at the height step.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Size { Sm, Md, Bs, Lg }
impl Size {
    pub const ALL: [Size; 4] = [Size::Sm, Size::Md, Size::Bs, Size::Lg];
    pub const fn name(self) -> &'static str { match self { Size::Sm => "sm", Size::Md => "md", Size::Bs => "bs", Size::Lg => "lg" } }
    pub const fn height_step(self) -> Step { match self { Size::Sm => Step::Sm, Size::Md => Step::Md, Size::Bs => Step::Bs, Size::Lg => Step::Lg } }
    /// text xs is reserved for captions/badges, so the smallest control still reads at `sm`
    pub const fn text_step(self) -> Step { match self { Size::Sm | Size::Md => Step::Sm, Size::Bs => Step::Md, Size::Lg => Step::Bs } }
    pub const fn pad_step(self) -> Step { match self { Size::Sm | Size::Md => Step::Sm, Size::Bs | Size::Lg => Step::Md } }
    pub const fn height(self) -> f32 { ladder::height(self.height_step()) }
    pub const fn text(self) -> f32 { ladder::text(self.text_step()) }
    pub const fn pad_x(self) -> f32 { ladder::space(self.pad_step()) }
}

/// Card padding axis -> spacing ladder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pad { None, Sm, Md, Lg }
impl Pad {
    pub const ALL: [Pad; 4] = [Pad::None, Pad::Sm, Pad::Md, Pad::Lg];
    pub const fn name(self) -> &'static str { match self { Pad::None => "none", Pad::Sm => "sm", Pad::Md => "md", Pad::Lg => "lg" } }
    pub const fn step(self) -> Option<Step> { match self { Pad::None => None, Pad::Sm => Some(Step::Sm), Pad::Md => Some(Step::Md), Pad::Lg => Some(Step::Bs) } }
    pub const fn px(self) -> f32 { match self.step() { None => 0.0, Some(s) => ladder::space(s) } }
}

/// The one style applied to every button/input/select.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ControlStyle { pub variant: Variant, pub shape: Shape, pub size: Size }

impl ControlStyle {
    pub const fn new(variant: Variant, shape: Shape, size: Size) -> Self { ControlStyle { variant, shape, size } }
    pub const fn height(&self) -> f32 { self.size.height() }
    pub const fn text(&self) -> f32 { self.size.text() }
    pub const fn pad_x(&self) -> f32 { self.size.pad_x() }
    /// Radius in px; a pill is clamped to half the height so it never exceeds a perfect semicircle.
    pub fn radius(&self) -> f32 { self.shape.radius().min(self.height() / 2.0) }
    pub const fn with_variant(self, v: Variant) -> Self { ControlStyle { variant: v, ..self } }
    pub const fn with_size(self, s: Size) -> Self { ControlStyle { size: s, ..self } }
    pub const fn with_shape(self, s: Shape) -> Self { ControlStyle { shape: s, ..self } }
}

/// Resolved colors of a variant (normal / hover / pressed) for a palette.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VariantColors { pub bg: Rgba, pub fg: Rgba, pub border: Rgba, pub hover_bg: Rgba, pub active_bg: Rgba }

impl Variant {
    pub fn colors(self, p: &Palette) -> VariantColors {
        let none = Rgba::TRANSPARENT;
        match self {
            Variant::Primary => VariantColors { bg: p.theme, fg: p.on_theme, border: p.theme, hover_bg: p.theme_alt, active_bg: p.theme_sub },
            Variant::Secondary => VariantColors { bg: p.button, fg: p.text_primary, border: p.border, hover_bg: p.state_hover, active_bg: p.state_selected },
            Variant::Soft => VariantColors { bg: p.theme.with_alpha_pct(16), fg: p.theme, border: none, hover_bg: p.theme.with_alpha_pct(26), active_bg: p.theme.with_alpha_pct(36) },
            Variant::Outline => VariantColors { bg: none, fg: p.text_primary, border: p.border_strong, hover_bg: p.state_hover, active_bg: p.state_selected },
            Variant::Ghost | Variant::IconBox => VariantColors { bg: none, fg: p.text_secondary, border: none, hover_bg: p.state_hover, active_bg: p.state_selected },
            Variant::Link => VariantColors { bg: none, fg: p.info.base, border: none, hover_bg: none, active_bg: none },
            Variant::Destructive => VariantColors { bg: p.danger.base, fg: p.on_status, border: p.danger.base, hover_bg: p.danger.hover, active_bg: p.danger.base },
        }
    }
}
