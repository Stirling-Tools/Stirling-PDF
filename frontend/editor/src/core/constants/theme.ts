// Theme constants and utilities

// Stored theme preference. "system" follows the OS.
export type ThemeMode = "light" | "dark" | "system";

// The concrete scheme applied to the UI.
export type ColorScheme = "light" | "dark";

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

// Resolve a theme preference to a concrete light/dark scheme.
// Falls back to systemScheme for unrecognised values (e.g. stale "rainbow").
export function resolveColorScheme(
  mode: ThemeMode,
  systemScheme: ColorScheme,
): ColorScheme {
  if (mode === "light" || mode === "dark") return mode;
  return systemScheme;
}
