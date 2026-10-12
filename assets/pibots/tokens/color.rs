/// 8-bit sRGB + alpha (0..=255). Built from `0xRRGGBB` literals so palettes read like the reference system.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rgba { pub r: u8, pub g: u8, pub b: u8, pub a: u8 }

impl Rgba {
    pub const fn hex(v: u32) -> Self { Rgba { r: (v >> 16) as u8, g: (v >> 8) as u8, b: v as u8, a: 255 } }
    /// `alpha_pct` in percent (0..=100).
    pub const fn with_alpha_pct(self, alpha_pct: u32) -> Self { Rgba { a: ((alpha_pct * 255 + 50) / 100) as u8, ..self } }
    pub const fn with_alpha_pm(self, pm: u32) -> Self { Rgba { a: ((pm * 255 + 500) / 1000) as u8, ..self } }
    pub const TRANSPARENT: Rgba = Rgba { r: 0, g: 0, b: 0, a: 0 };
    /// "#RRGGBB" or "#RRGGBBAA" (docs, debugging).
    pub fn css(self) -> String {
        if self.a == 255 { format!("#{:02X}{:02X}{:02X}", self.r, self.g, self.b) } else { format!("#{:02X}{:02X}{:02X}{:02X}", self.r, self.g, self.b, self.a) }
    }
    /// WCAG relative luminance.
    pub fn luminance(self) -> f64 {
        let f = |c: u8| { let c = c as f64 / 255.0; if c <= 0.03928 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) } };
        0.2126 * f(self.r) + 0.7152 * f(self.g) + 0.0722 * f(self.b)
    }
    /// WCAG contrast ratio against another opaque color.
    pub fn contrast(self, other: Rgba) -> f64 {
        let (a, b) = (self.luminance(), other.luminance());
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }
}
