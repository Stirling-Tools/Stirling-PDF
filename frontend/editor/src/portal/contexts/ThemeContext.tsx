import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { preferencesService } from "@app/services/preferencesService";
import {
  getSystemTheme,
  resolveColorScheme,
  type ThemeMode,
} from "@app/constants/theme";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Mirror the shared theme MODE; re-read on cross-tab storage changes and,
  // while on "system", on OS scheme changes.
  const [mode, setMode] = useState<ThemeMode>(() =>
    preferencesService.getPreference("theme"),
  );
  const [systemScheme, setSystemScheme] = useState(getSystemTheme);

  useEffect(() => {
    const syncMode = () => setMode(preferencesService.getPreference("theme"));
    window.addEventListener("storage", syncMode);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const syncSystem = () => setSystemScheme(media?.matches ? "dark" : "light");
    media?.addEventListener("change", syncSystem);
    return () => {
      window.removeEventListener("storage", syncMode);
      media?.removeEventListener("change", syncSystem);
    };
  }, []);

  const theme = resolveColorScheme(mode, systemScheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    const setTheme = (next: Theme) => {
      preferencesService.setPreference("theme", next);
      setMode(next);
    };
    return {
      theme,
      setTheme,
      toggle: () => setTheme(theme === "light" ? "dark" : "light"),
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}
