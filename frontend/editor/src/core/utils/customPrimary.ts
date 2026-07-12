// Derives an accessible custom-theme primary from a user-chosen colour: a lightness clamp keeps it visible on the base, and the on-primary colour is contrast-picked so filled content stays legible.

import type { ColorScheme } from "@app/constants/theme";

export interface DerivedPrimary {
  /** Contrast-safe primary to drive --user-primary. Tuned for FILLS. */
  primary: string;
  /** Legible foreground for content on the filled primary. */
  onPrimary: string;
  /** Accent tuned as a foreground (text/icon) on the app surface — light on dark, dark on light. */
  accentForeground: string;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

const FALLBACK = "#3b82f6"; // blue-500 — fallback when a stored colour won't parse

function parseHex(input: string): RGB | null {
  const s = input.trim().replace(/^#/, "");
  const hex =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function relLuminance({ r, g, b }: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Relative-luminance cutoff above which on-primary flips white→black (tuned high so saturated brand hues keep white text).
const ON_PRIMARY_DARK_CUTOFF = 0.62;

// Lightness floor (dark base) / ceiling (light base) so an accent stays distinguishable from the base surfaces.
const DARK_MIN_L = 0.42;
const LIGHT_MAX_L = 0.6;

// Stricter lightness bounds for an accent used as foreground text/icon (light on dark, dark on light).
const DARK_FG_MIN_L = 0.62;
const LIGHT_FG_MAX_L = 0.45;

// Saturation/lightness bounds so a stored accent stays a real, visible hue (never white/grey/black).
const ACCENT_MIN_S = 0.35;
const ACCENT_MIN_L = 0.32;
const ACCENT_MAX_L = 0.68;

// Clamp a pick into gamut; at achromatic extremes (no hue in hex) borrow the hue from `previous` so black/white/grey give the darkest/lightest/least-saturated version of the working hue, not an unrelated colour.
export function clampAccentChoice(input: string, previous?: string): string {
  const rgb = parseHex(input);
  if (!rgb) return FALLBACK;
  const { h, s, l } = rgbToHsl(rgb);
  const prevRgb = previous ? parseHex(previous) : null;
  const hue = s < 1e-6 && prevRgb ? rgbToHsl(prevRgb).h : h;
  return hslToHex(
    hue,
    Math.max(s, ACCENT_MIN_S),
    Math.min(Math.max(l, ACCENT_MIN_L), ACCENT_MAX_L),
  );
}

export function deriveAccessiblePrimary(
  input: string,
  base: ColorScheme,
): DerivedPrimary {
  const rgb = parseHex(input) ?? parseHex(FALLBACK)!;
  const { h, s } = rgbToHsl(rgb);
  let { l } = rgbToHsl(rgb);
  if (base === "dark" && l < DARK_MIN_L) l = DARK_MIN_L;
  if (base === "light" && l > LIGHT_MAX_L) l = LIGHT_MAX_L;

  const primary = hslToHex(h, s, l);
  const lum = relLuminance(parseHex(primary)!);
  // White by default; flip to black only once the colour is genuinely light.
  const onPrimary = lum > ON_PRIMARY_DARK_CUTOFF ? "#000000" : "#ffffff";

  // Foreground accent: same hue, lightness pushed so it stays legible on the base surface.
  let fgL = rgbToHsl(rgb).l;
  if (base === "dark") fgL = Math.max(fgL, DARK_FG_MIN_L);
  else fgL = Math.min(fgL, LIGHT_FG_MAX_L);
  const accentForeground = hslToHex(h, s, fgL);

  return { primary, onPrimary, accentForeground };
}
