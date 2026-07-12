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
  getSystemTheme,
  resolveColorScheme,
  DEFAULT_ACCENT,
  DEFAULT_ACCENT_COLOR,
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
  // Each base has its own accent; "system" picks by the resolved scheme.
  const primaryInput =
    colorScheme === "dark"
      ? preferences.darkPrimary
      : preferences.lightPrimary;

  // A colour tints surfaces; the "default" sentinel means neutral surfaces + blue buttons (derive from blue, flag data-accent="default" so colors.css skips the tint).
  const isDefaultAccent = primaryInput === DEFAULT_ACCENT;
  const accentColor = isDefaultAccent ? DEFAULT_ACCENT_COLOR : primaryInput;

  // Mirror the scheme to data-theme (SUI) and set data-app-theme="custom" so colors.css derives from --user-primary.
  useIsomorphicEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", colorScheme);
    root.setAttribute("data-app-theme", "custom");
    root.setAttribute("data-accent", isDefaultAccent ? "default" : "custom");
    // Clamp/contrast-pick the accent so it can't collapse into the base and stays legible.
    const { primary, onPrimary, accentForeground } = deriveAccessiblePrimary(
      accentColor,
      colorScheme,
    );
    root.style.setProperty("--user-primary", primary);
    root.style.setProperty("--user-primary-on", onPrimary);
    root.style.setProperty("--user-accent-fg", accentForeground);
  }, [colorScheme, accentColor, isDefaultAccent]);

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
