import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { MantineProvider } from "@mantine/core";
import { useIsomorphicEffect } from "@mantine/hooks";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { mantineTheme } from "@app/theme/mantineTheme";
import { ToastProvider } from "@app/components/toast";
import ToastRenderer from "@app/components/toast/ToastRenderer";
import { ToastPortalBinder } from "@app/components/toast";
import {
  type ThemeMode,
  DEFAULT_ACCENT,
  getSystemTheme,
  resolveColorScheme,
} from "@app/constants/theme";
import { deriveAccessiblePrimary } from "@app/utils/customPrimary";
// SUI shared design-system tokens (used by @app/ui); key on `data-theme`.
import "@app/tokens/tokens.css";
import "@app/theme/index.css";

interface ThemeContextType {
  themeMode: ThemeMode;
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

  // The mode resolved to a concrete light/dark base.
  const colorScheme = resolveColorScheme(themeMode, systemScheme);

  // Each scheme carries its own accent; the sentinel means "neutral default".
  const accentChoice =
    colorScheme === "dark" ? preferences.darkPrimary : preferences.lightPrimary;

  // Mirror the scheme + accent to <html>. For a real accent we derive the three
  // contrast-safe --user-* vars that colors.css consumes (fill, on-fill,
  // accent-as-text); the default sentinel keeps data-accent="default" and clears
  // them, so colors.css falls back to its static blue.
  useIsomorphicEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", colorScheme);
    root.setAttribute("data-app-theme", "custom");
    const userVars = [
      "--user-primary",
      "--user-primary-on",
      "--user-accent-fg",
    ];
    if (!accentChoice || accentChoice === DEFAULT_ACCENT) {
      root.setAttribute("data-accent", "default");
      userVars.forEach((v) => root.style.removeProperty(v));
      return;
    }
    const derived = deriveAccessiblePrimary(accentChoice, colorScheme);
    root.setAttribute("data-accent", "custom");
    root.style.setProperty("--user-primary", derived.primary);
    root.style.setProperty("--user-primary-on", derived.onPrimary);
    root.style.setProperty("--user-accent-fg", derived.accentForeground);
  }, [colorScheme, accentChoice]);

  const value = useMemo<ThemeContextType>(
    () => ({ themeMode, setTheme }),
    [themeMode, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <MantineProvider
        theme={mantineTheme}
        defaultColorScheme={colorScheme}
        forceColorScheme={colorScheme}
      >
        <div style={{ minHeight: "100vh" }}>
          <ToastProvider>
            <ToastPortalBinder />
            {children}
            <ToastRenderer />
          </ToastProvider>
        </div>
      </MantineProvider>
    </ThemeContext.Provider>
  );
}
