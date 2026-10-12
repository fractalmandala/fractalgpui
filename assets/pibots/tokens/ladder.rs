//! The four independent ladders. Whole pixels only.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Step { Xs, Sm, Md, Bs, Lg, Xl, Xxl }

impl Step {
    pub const ALL: [Step; 7] = [Step::Xs, Step::Sm, Step::Md, Step::Bs, Step::Lg, Step::Xl, Step::Xxl];
    pub const fn index(self) -> usize { self as usize }
    pub const fn name(self) -> &'static str {
        match self { Step::Xs => "xs", Step::Sm => "sm", Step::Md => "md", Step::Bs => "bs", Step::Lg => "lg", Step::Xl => "xl", Step::Xxl => "2xl" }
    }
}

/// One ladder: seven whole-pixel values indexed by [`Step`].
#[derive(Clone, Copy, Debug)]
pub struct Ladder { pub name: &'static str, pub unit: &'static str, pub px: [u16; 7], pub note: &'static str }

impl Ladder {
    pub const fn at(&self, s: Step) -> u16 { self.px[s as usize] }
    pub const fn f(&self, s: Step) -> f32 { self.px[s as usize] as f32 }
}

/// Radius ladder. `2xl` is the pill / `rounded-full` alias.
pub const RADIUS: Ladder = Ladder { name: "border-radius", unit: "px", px: [2, 4, 8, 12, 16, 24, 9999], note: "2xl = pill (alias rounded-full)" };
pub const SPACING: Ladder = Ladder { name: "spacing", unit: "px", px: [4, 8, 16, 24, 32, 40, 48], note: "padding, gaps, margins" };
pub const HEIGHT: Ladder = Ladder { name: "button height", unit: "px", px: [20, 24, 28, 32, 40, 48, 56], note: "every control: buttons, inputs, selects" };
pub const TEXT: Ladder = Ladder { name: "text", unit: "px", px: [10, 12, 14, 16, 19, 24, 32], note: "xs is reserved for captions and badges" };

pub const LADDERS: [&Ladder; 4] = [&RADIUS, &SPACING, &HEIGHT, &TEXT];

pub const fn radius(s: Step) -> f32 { RADIUS.f(s) }
pub const fn space(s: Step) -> f32 { SPACING.f(s) }
pub const fn height(s: Step) -> f32 { HEIGHT.f(s) }
pub const fn text(s: Step) -> f32 { TEXT.f(s) }
/// Hairline (borders, separators). Not a ladder step.
pub const HAIRLINE: f32 = 1.0;
