//! Layered drop shadows (black at alpha) per mode: eight steps, one or two layers each. Offsets are always (0, dy).
use crate::color::Rgba;
use crate::palette::Mode;

/// One layer: `0 dy blur` in black at `alpha_pm` per mille (50 = 5%).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Layer { pub dy: f32, pub blur: f32, pub alpha_pm: u16 }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShadowStep { Xs, Sm, Md, Bs, Lg, Xl, Xxl, Xxxl }
impl ShadowStep {
    pub const ALL: [ShadowStep; 8] = [ShadowStep::Xs, ShadowStep::Sm, ShadowStep::Md, ShadowStep::Bs, ShadowStep::Lg, ShadowStep::Xl, ShadowStep::Xxl, ShadowStep::Xxxl];
    pub const fn name(self) -> &'static str {
        match self { ShadowStep::Xs => "xs", ShadowStep::Sm => "sm", ShadowStep::Md => "md", ShadowStep::Bs => "bs", ShadowStep::Lg => "lg", ShadowStep::Xl => "xl", ShadowStep::Xxl => "2xl", ShadowStep::Xxxl => "3xl" }
    }
    pub fn layers(self, mode: Mode) -> &'static [Layer] {
        let t = match mode { Mode::Dark => &DARK, Mode::Light => &LIGHT };
        t[self as usize]
    }
}
impl Layer { pub fn color(&self) -> Rgba { Rgba { r: 0, g: 0, b: 0, a: ((self.alpha_pm as u32 * 255 + 500) / 1000) as u8 } } }

const fn l(dy: f32, blur: f32, alpha_pm: u16) -> Layer { Layer { dy, blur, alpha_pm } }

static DARK: [&[Layer]; 8] = [
    &[l(1.0, 2.0, 300)],
    &[l(1.0, 2.0, 250), l(2.0, 4.0, 200)],
    &[l(2.0, 4.0, 200), l(8.0, 16.0, 250)],
    &[l(2.0, 4.0, 200), l(6.0, 14.0, 250)],
    &[l(4.0, 8.0, 250), l(12.0, 24.0, 300)],
    &[l(8.0, 16.0, 300), l(20.0, 36.0, 350)],
    &[l(12.0, 24.0, 350), l(28.0, 48.0, 400)],
    &[l(16.0, 32.0, 400), l(36.0, 64.0, 450)],
];
static LIGHT: [&[Layer]; 8] = [
    &[l(1.0, 2.0, 50)],
    &[l(1.0, 2.0, 60), l(2.0, 4.0, 40)],
    &[l(2.0, 4.0, 50), l(8.0, 16.0, 50)],
    &[l(2.0, 4.0, 50), l(6.0, 14.0, 50)],
    &[l(4.0, 8.0, 60), l(12.0, 24.0, 60)],
    &[l(8.0, 16.0, 70), l(20.0, 36.0, 70)],
    &[l(12.0, 24.0, 80), l(28.0, 48.0, 80)],
    &[l(16.0, 32.0, 100), l(36.0, 64.0, 100)],
];
