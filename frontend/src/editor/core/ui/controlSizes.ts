/** Shared control height scale (px) — Button, ActionIcon and SegmentedControl all use it. */
export const CONTROL_HEIGHT = {
  sm: "30px",
  md: "36px",
  lg: "42px",
  xl: "48px",
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHT;

/** Optional padding-override scale for Button (`p`/`px`/`py` props). Undefined = Mantine's size-based default. */
export const CONTROL_PADDING = {
  none: "0",
  xs: "0.5rem",
  sm: "0.75rem",
  md: "1rem",
  lg: "1.25rem",
  xl: "1.5rem",
} as const;

export type ControlPadding = keyof typeof CONTROL_PADDING;

/**
 * Shared label font-size scale (rem). Both a control's `size` and its optional
 * `fontSize` prop index into this same scale — `md` is the neutral point.
 */
export const CONTROL_FONT_SIZE = {
  xs: 0.75,
  sm: 0.875,
  md: 1.0,
  lg: 1.125,
  xl: 1.25,
} as const;

export type ControlFontSize = keyof typeof CONTROL_FONT_SIZE;

/**
 * Resolve a label font-size from the control `size` and a relative `fontSize`.
 * The base comes from `size`; `fontSize` scales it relative to `md` (= no
 * change). Because it scales the size-derived base rather than replacing it, an
 * `xl` button with `md` text stays larger than a `sm` button with `lg` text.
 */
export function resolveFontSize(
  size: ControlSize,
  fontSize: ControlFontSize,
): string {
  const base = CONTROL_FONT_SIZE[size];
  const factor = CONTROL_FONT_SIZE[fontSize] / CONTROL_FONT_SIZE.md;
  return `${(base * factor).toFixed(3)}rem`;
}
