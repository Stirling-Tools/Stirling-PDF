import {
  type ToolPanelMode,
  DEFAULT_TOOL_PANEL_MODE,
} from "@app/constants/toolPanel";
import { type ThemeMode, DEFAULT_ACCENT } from "@app/constants/theme";

export type LogoVariant = "modern" | "classic";

export type PdfRenderMode = "normal" | "dark" | "sepia";

export type StartupView = "tools" | "read" | "automate";

export type ViewerZoomSetting =
  | "auto"
  | "fitWidth"
  | "fitPage"
  | "50"
  | "75"
  | "100"
  | "125"
  | "150"
  | "200";

// SaaS-only: which app a team lead lands on after signing in. Members can't
// reach the processor, so this never applies to them.
export type LoginLandingView = "processor" | "editor";

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
  defaultStartupView: StartupView;
  defaultViewerZoom: ViewerZoomSetting;
  // SaaS-only: team lead's post-login landing app (processor vs editor).
  loginLandingView: LoginLandingView;
  theme: ThemeMode;
  lightPrimary: string;
  darkPrimary: string;
  toolPanelModePromptSeen: boolean;
  hasSelectedToolPanelMode: boolean;
  showLegacyToolDescriptions: boolean;
  hasCompletedOnboarding: boolean;
  hasSeenIntroOnboarding: boolean;
  hasSeenCookieBanner: boolean;
  hideUnavailableTools: boolean;
  hideUnavailableConversions: boolean;
  logoVariant: LogoVariant | null;
  pdfRenderMode: PdfRenderMode;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  defaultToolPanelMode: DEFAULT_TOOL_PANEL_MODE,
  defaultStartupView: "tools",
  defaultViewerZoom: "auto",
  loginLandingView: "processor",
  theme: "system",
  lightPrimary: DEFAULT_ACCENT,
  darkPrimary: DEFAULT_ACCENT,
  toolPanelModePromptSeen: false,
  hasSelectedToolPanelMode: false,
  showLegacyToolDescriptions: false,
  hasCompletedOnboarding: false,
  hasSeenIntroOnboarding: false,
  hasSeenCookieBanner: false,
  hideUnavailableTools: false,
  hideUnavailableConversions: false,
  logoVariant: null,
  pdfRenderMode: "normal",
};

const STORAGE_KEY = "stirlingpdf_preferences";

class PreferencesService {
  private serverDefaults: Partial<UserPreferences> = {};

  constructor() {
    this.migrateLegacyTheme();
  }

  // One-time migration from the old theme model (theme: light|dark|midnight|
  // custom|system + customThemeBase + customThemePrimary) to the new one
  // (theme: light|dark|system + lightPrimary + darkPrimary). Runs once and
  // rewrites storage; a no-op for already-migrated or empty preferences.
  private migrateLegacyTheme(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const p = JSON.parse(stored) as Record<string, unknown>;
      const hadLegacy =
        "customThemeBase" in p ||
        "customThemePrimary" in p ||
        p.theme === "custom" ||
        p.theme === "midnight";
      if (!hadLegacy) return;

      const legacyBase = p.customThemeBase === "light" ? "light" : "dark";
      const legacyPrimary =
        typeof p.customThemePrimary === "string"
          ? p.customThemePrimary
          : DEFAULT_ACCENT;

      // midnight → dark; custom → whichever base it was sitting on.
      if (p.theme === "midnight") p.theme = "dark";
      else if (p.theme === "custom") p.theme = legacyBase;

      // Seed the customised side from the old primary; the other side gets the default (neutral) theme.
      if (p.lightPrimary === undefined) {
        p.lightPrimary =
          legacyBase === "light" ? legacyPrimary : DEFAULT_ACCENT;
      }
      if (p.darkPrimary === undefined) {
        p.darkPrimary = legacyBase === "dark" ? legacyPrimary : DEFAULT_ACCENT;
      }
      delete p.customThemeBase;
      delete p.customThemePrimary;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (error) {
      console.error("Error migrating theme preferences:", error);
    }
  }

  setServerDefaults(defaults: Partial<UserPreferences>): void {
    this.serverDefaults = defaults;
  }

  getPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    // Explicitly re-read every time in case preferences have changed in another tab etc.
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        if (key in preferences && preferences[key] !== undefined) {
          return preferences[key]!;
        }
      }
    } catch (error) {
      console.error("Error reading preference:", key, error);
    }
    // Use server defaults if available, otherwise use hardcoded defaults
    if (key in this.serverDefaults && this.serverDefaults[key] !== undefined) {
      return this.serverDefaults[key]!;
    }
    return DEFAULT_PREFERENCES[key];
  }

  setPreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const preferences = stored ? JSON.parse(stored) : {};
      preferences[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error("Error writing preference:", key, error);
    }
  }

  getAllPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        // Merge with server defaults first, then stored preferences
        return {
          ...DEFAULT_PREFERENCES,
          ...this.serverDefaults,
          ...preferences,
        };
      }
    } catch (error) {
      console.error("Error reading preferences", error);
    }
    // Merge server defaults with hardcoded defaults
    return { ...DEFAULT_PREFERENCES, ...this.serverDefaults };
  }

  clearAllPreferences(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing preferences:", error);
      throw error;
    }
  }
}

export const preferencesService = new PreferencesService();
