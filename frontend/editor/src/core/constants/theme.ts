// Theme constants and utilities

export type ThemeMode = "light" | "dark" | "system";

// The concrete light/dark base applied to Mantine + the neutral ramp.
export type ColorScheme = "light" | "dark";

// lightPrimary/darkPrimary hold either a colour (tints surfaces) or this sentinel (neutral surfaces + blue buttons; ThemeProvider maps it to DEFAULT_ACCENT_COLOR and flags data-accent="default").
export const DEFAULT_ACCENT = "default";
export const DEFAULT_ACCENT_COLOR = "#3b82f6"; // blue-500 — buttons in the default theme

// 14 curated mid-tone accents filling the 3×5 grid alongside the "Default" cell. Literal hex: the picker stores the value verbatim and deriveAccessiblePrimary parses it.
export const THEME_ACCENT_PRESETS = [
  // blues → purples (one purple trimmed so the grid leaves room for Default)
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#d946ef", // fuchsia
  // pinks → warm
  "#ec4899", // pink
  "#f43f5e", // rose
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  // yellow → greens → cyan
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
];

// Detect the OS theme preference. Never throws: if the environment can't be
// read (no window, no matchMedia, or it errors), defaults to "light".
export function getSystemTheme(): ColorScheme {
  try {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

// Resolve the theme MODE to the concrete light/dark base Mantine uses.
// "system" follows the OS; anything unrecognised falls back to it too.
export function resolveColorScheme(
  mode: ThemeMode,
  systemScheme: ColorScheme,
): ColorScheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemScheme;
}
