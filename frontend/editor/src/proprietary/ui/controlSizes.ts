/** Shared control height scale (px) — Button, ActionIcon and SegmentedControl all use it. */
export const CONTROL_HEIGHT = {
  sm: "30px",
  md: "36px",
  lg: "42px",
  xl: "48px",
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHT;
