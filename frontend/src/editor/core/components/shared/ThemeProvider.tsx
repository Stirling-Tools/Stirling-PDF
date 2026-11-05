import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useIsomorphicEffect } from "@mantine/hooks";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import {
  type ColorScheme,
  type ThemeMode,
  getSystemTheme,
  resolveColorScheme,
} from "@editor/constants/theme";
// SUI shared design-system tokens (used by @editor/ui); key on `data-theme`.
import "@editor/tokens/tokens.css";
import "@editor/theme/index.css";

interface ThemeContextType {
  themeMode: ThemeMode;
  /** The mode resolved to a concrete base, following the OS while on "system". */
  colorScheme: ColorScheme;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // preferences.theme is the single source of truth.
  const { preferences, updatePreference } = usePreferences();
  const themeMode = preferences.theme;
  const setTheme = useCallback(
    (mode: ThemeMode) => updatePreference("theme", mode),
    [updatePreference],
  );

  // Track the OS scheme so "system" updates live; only subscribe while on system.
  // If matchMedia is unavailable we bail out and keep the seeded value, which
  // getSystemTheme already defaults to light — so it never crashes.
  const [systemScheme, setSystemScheme] = useState(getSystemTheme);
  useIsomorphicEffect(() => {
    if (themeMode !== "system") return;
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemScheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themeMode]);

  const colorScheme = resolveColorScheme(themeMode, systemScheme);

  // Mirror the scheme to <html>. The accent is fixed to the default (neutral
  // surfaces + blue buttons): data-accent="default" and no --user-* overrides,
  // so colors.css resolves --c-primary to its static blue fallback.
  useIsomorphicEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", colorScheme);
    root.setAttribute("data-app-theme", "custom");
    root.setAttribute("data-accent", "default");
  }, [colorScheme]);

  const value = useMemo<ThemeContextType>(
    () => ({ themeMode, colorScheme, setTheme }),
    [themeMode, colorScheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
