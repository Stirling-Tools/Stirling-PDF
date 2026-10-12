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

/** Light-mode hex per hue — fallbacks only; theme.css owns the rendered values. */
const LIGHT_HEX: Record<AccentHue, string> = {
  green: "#16a34a",
  blue: "#2563eb",
  red: "#dc2626",
  orange: "#ea580c",
  purple: "#9333ea",
  teal: "#0d9488",
  pink: "#db2777",
  amber: "#d97706",
  indigo: "#4f46e5",
  cyan: "#0891b2",
  violet: "#7c3aed",
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
