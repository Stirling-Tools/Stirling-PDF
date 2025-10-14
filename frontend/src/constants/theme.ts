// Theme constants and utilities

export const ALL_THEMES = ['light', 'dark', 'rainbow'] as const;
export type ThemeMode = typeof ALL_THEMES[number];

export function isThemeMode(mode: string): mode is ThemeMode {
  return ALL_THEMES.includes(mode as ThemeMode);
}

// Detect OS theme preference
export function getSystemTheme(): 'light' | 'dark' {
  return window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
