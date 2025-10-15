// Theme constants and utilities

export type ThemeMode = 'light' | 'dark' | 'rainbow';

// Detect OS theme preference
export function getSystemTheme(): 'light' | 'dark' {
  return window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
