//! Adjust colours and contrast: renders every page, adjusts its pixels, and
//! writes the result as a page holding just that image.

#![forbid(unsafe_code)]

use stirling_pdfium::{Bitmap, Document, Error};

/// Pixels per point: pages are rasterised at 144 DPI.
pub const RENDER_SCALE: f64 = 2.0;

const OPAQUE_WHITE: u32 = 0xFFFF_FFFF;

/// Percentages from 0 to 200, where 100 leaves that property unchanged.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Adjustments {
    pub contrast: f64,
    pub brightness: f64,
    pub saturation: f64,
    pub red: f64,
    pub green: f64,
    pub blue: f64,
}

impl Default for Adjustments {
    fn default() -> Self {
        Self {
            contrast: 100.0,
            brightness: 100.0,
            saturation: 100.0,
            red: 100.0,
            green: 100.0,
            blue: 100.0,
        }
    }
}

/// Appends an adjusted image of each page of `source` to `target`, which should
/// start empty. Every output page keeps its source page's size in points.
pub fn adjust_document(
    source: &Document,
    target: &Document,
    adjustments: &Adjustments,
) -> Result<(), Error> {
    for index in 0..source.page_count() {
        let page = source.page(index)?;
        let width = f64::from(page.width());
        let height = f64::from(page.height());

        let mut bitmap = Bitmap::new_bgrx(to_pixels(width), to_pixels(height))?;
        bitmap.fill(OPAQUE_WHITE);
        page.render(&mut bitmap);
        let mut pixels = bitmap.read_pixels()?;
        adjust_bgrx(&mut pixels, adjustments);
        bitmap.write_pixels(&pixels)?;

        let mut image = target.new_image()?;
        image.set_bitmap(&bitmap)?;
        image.transform(width, 0.0, 0.0, height, 0.0, 0.0);
        let mut output = target.insert_page(index, width, height)?;
        output.insert(image);
        output.generate_content()?;
    }
    Ok(())
}

fn to_pixels(points: f64) -> usize {
    (points * RENDER_SCALE).round().max(1.0) as usize
}

/// Adjusts packed 4-byte pixels in B, G, R, unused order (PDFium's bitmaps),
/// leaving the fourth byte as it was.
pub fn adjust_bgrx(pixels: &mut [u8], adjustments: &Adjustments) {
    adjust_packed(pixels, adjustments, [2, 1, 0]);
}

/// Adjusts packed 4-byte pixels in R, G, B, A order (a canvas's `ImageData`),
/// leaving alpha as it was.
pub fn adjust_rgba(pixels: &mut [u8], adjustments: &Adjustments) {
    adjust_packed(pixels, adjustments, [0, 1, 2]);
}

/// `[red, green, blue]` are each channel's byte offset within a pixel.
fn adjust_packed(pixels: &mut [u8], adjustments: &Adjustments, [red, green, blue]: [usize; 3]) {
    for pixel in pixels.chunks_exact_mut(4) {
        let adjusted = adjust_rgb([pixel[red], pixel[green], pixel[blue]], adjustments);
        [pixel[red], pixel[green], pixel[blue]] = adjusted;
    }
}

/// Channel gains, then contrast about mid-grey, then brightness, then
/// saturation scaled in HSL space.
pub fn adjust_rgb([red, green, blue]: [u8; 3], adjustments: &Adjustments) -> [u8; 3] {
    let contrast = adjustments.contrast / 100.0;
    let brightness = adjustments.brightness / 100.0;
    let tone = |value: u8, gain: f64| {
        let value = clamp_channel((f64::from(value) * gain - 128.0) * contrast + 128.0);
        clamp_channel(value * brightness)
    };
    let red = tone(red, adjustments.red / 100.0);
    let green = tone(green, adjustments.green / 100.0);
    let blue = tone(blue, adjustments.blue / 100.0);

    let (hue, saturation, lightness) = to_hsl(red / 255.0, green / 255.0, blue / 255.0);
    let saturation = (saturation * adjustments.saturation / 100.0).clamp(0.0, 1.0);
    let [red, green, blue] = from_hsl(hue, saturation, lightness);
    [to_byte(red), to_byte(green), to_byte(blue)]
}

fn clamp_channel(value: f64) -> f64 {
    value.clamp(0.0, 255.0)
}

fn to_byte(unit: f64) -> u8 {
    clamp_channel((unit * 255.0).round()) as u8
}

/// Hue as a fraction of a full turn; all three components in 0..=1.
fn to_hsl(red: f64, green: f64, blue: f64) -> (f64, f64, f64) {
    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    let lightness = (max + min) / 2.0;
    if max == min {
        return (0.0, 0.0, lightness);
    }
    let delta = max - min;
    let saturation = if lightness > 0.5 {
        delta / (2.0 - max - min)
    } else {
        delta / (max + min)
    };
    let sector = if max == red {
        (green - blue) / delta + if green < blue { 6.0 } else { 0.0 }
    } else if max == green {
        (blue - red) / delta + 2.0
    } else {
        (red - green) / delta + 4.0
    };
    (sector / 6.0, saturation, lightness)
}

fn from_hsl(hue: f64, saturation: f64, lightness: f64) -> [f64; 3] {
    if saturation == 0.0 {
        return [lightness; 3];
    }
    let q = if lightness < 0.5 {
        lightness * (1.0 + saturation)
    } else {
        lightness + saturation - lightness * saturation
    };
    let p = 2.0 * lightness - q;
    [
        hue_to_channel(p, q, hue + 1.0 / 3.0),
        hue_to_channel(p, q, hue),
        hue_to_channel(p, q, hue - 1.0 / 3.0),
    ]
}

fn hue_to_channel(p: f64, q: f64, hue: f64) -> f64 {
    let hue = if hue < 0.0 {
        hue + 1.0
    } else if hue > 1.0 {
        hue - 1.0
    } else {
        hue
    };
    if hue < 1.0 / 6.0 {
        p + (q - p) * 6.0 * hue
    } else if hue < 1.0 / 2.0 {
        q
    } else if hue < 2.0 / 3.0 {
        p + (q - p) * (2.0 / 3.0 - hue) * 6.0
    } else {
        p
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with(change: impl FnOnce(&mut Adjustments)) -> Adjustments {
        let mut adjustments = Adjustments::default();
        change(&mut adjustments);
        adjustments
    }

    #[test]
    fn neutral_adjustments_leave_pixels_unchanged() {
        let neutral = Adjustments::default();
        for red in (0..=255).step_by(5) {
            for green in (0..=255).step_by(5) {
                for blue in (0..=255).step_by(5) {
                    let pixel = [red, green, blue];
                    assert_eq!(adjust_rgb(pixel, &neutral), pixel, "{pixel:?}");
                }
            }
        }
    }

    #[test]
    fn zero_contrast_is_mid_grey() {
        let flat = with(|a| a.contrast = 0.0);
        assert_eq!(adjust_rgb([10, 200, 90], &flat), [128, 128, 128]);
    }

    #[test]
    fn zero_brightness_is_black() {
        let dark = with(|a| a.brightness = 0.0);
        assert_eq!(adjust_rgb([10, 200, 90], &dark), [0, 0, 0]);
    }

    #[test]
    fn zero_saturation_keeps_lightness() {
        let grey = with(|a| a.saturation = 0.0);
        assert_eq!(adjust_rgb([255, 0, 0], &grey), [128, 128, 128]);
    }

    #[test]
    fn channel_gain_applies_before_clamping() {
        assert_eq!(
            adjust_rgb([200, 100, 50], &with(|a| a.red = 0.0)),
            [0, 100, 50]
        );
        assert_eq!(
            adjust_rgb([200, 100, 50], &with(|a| a.red = 200.0)),
            [255, 100, 50]
        );
    }

    #[test]
    fn contrast_stretches_about_mid_grey() {
        let punchy = with(|a| a.contrast = 200.0);
        assert_eq!(adjust_rgb([200, 100, 50], &punchy), [255, 72, 0]);
    }

    #[test]
    fn bgrx_order_is_respected_and_fourth_byte_kept() {
        let mut pixels = [50, 100, 200, 7];
        adjust_bgrx(&mut pixels, &with(|a| a.red = 0.0));
        assert_eq!(pixels, [50, 100, 0, 7]);
    }

    #[test]
    fn rgba_order_is_respected_and_alpha_kept() {
        let mut pixels = [200, 100, 50, 7];
        adjust_rgba(&mut pixels, &with(|a| a.red = 0.0));
        assert_eq!(pixels, [0, 100, 50, 7]);
    }

    #[test]
    fn both_layouts_adjust_a_pixel_identically() {
        let punchy = with(|a| {
            a.contrast = 160.0;
            a.saturation = 40.0;
            a.blue = 130.0;
        });
        let mut bgrx = [30, 140, 220, 255];
        let mut rgba = [220, 140, 30, 255];
        adjust_bgrx(&mut bgrx, &punchy);
        adjust_rgba(&mut rgba, &punchy);
        assert_eq!([bgrx[2], bgrx[1], bgrx[0]], [rgba[0], rgba[1], rgba[2]]);
    }
}
