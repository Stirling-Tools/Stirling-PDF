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
