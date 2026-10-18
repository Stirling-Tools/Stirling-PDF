// The app's shared categorical accent palette. The single source of truth for the VALUES is
// theme.css (`--accent-<hue>`), which defines a light and a dark variant per hue — in dark mode
// accents get LIGHTER, not darker, so they keep contrast against a dark background. This util is
// for the places CSS can't reach directly (inline styles, SVG, cycled group colors).
//
// `themed` (default true) returns a var() reference that live-adapts to the active theme; pass
// `themed: false` only where a literal hex is required (canvas, persisted data, exports) — that
// freezes the light-mode value.

export type AccentHue =
  | "green"
  | "blue"
  | "red"
  | "orange"
  | "purple"
  | "teal"
  | "pink"
  | "amber"
  | "indigo"
  | "cyan"
  | "violet"
  | "gray";

/** Light-mode hex per hue — must match theme.css `--accent-<hue>`; the CSS owns the rendered value. */
const LIGHT_HEX: Record<AccentHue, string> = {
  green: "#55763f",
  blue: "#4a6fa5",
  red: "#a9564f",
  orange: "#99652f",
  purple: "#7d5b92",
  teal: "#2f7d75",
  pink: "#a8577c",
  amber: "#99652f",
  indigo: "#5f62a8",
  cyan: "#2f7d75",
  violet: "#7d5b92",
  gray: "#6b7280",
};

/** Hues cycled across categorical UI (sidebar groups etc.), in display order. */
export const ACCENT_CYCLE: readonly AccentHue[] = [
  "green",
  "blue",
  "red",
  "orange",
  "purple",
  "teal",
  "pink",
  "amber",
  "indigo",
  "cyan",
];

export interface AccentColorOptions {
  /** Adapt to the active theme (lighter shade in dark mode). Default true. */
  themed?: boolean;
}

/** CSS color for a hue: a theme-adaptive var() by default, or the literal light hex. */
export function accentColor(
  hue: AccentHue,
  options?: AccentColorOptions,
): string {
  return (options?.themed ?? true)
    ? `var(--accent-${hue}, ${LIGHT_HEX[hue]})`
    : LIGHT_HEX[hue];
}

/** The nth categorical accent, wrapping around the cycle. */
export function accentCycleColor(
  index: number,
  options?: AccentColorOptions,
): string {
  return accentColor(ACCENT_CYCLE[index % ACCENT_CYCLE.length], options);
}
