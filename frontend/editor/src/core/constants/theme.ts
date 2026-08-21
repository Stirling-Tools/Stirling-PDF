// Theme constants and utilities

export type ThemeMode = "light" | "dark" | "system";

// The concrete light/dark base applied to Mantine + the neutral ramp.
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
