import {
  type ToolPanelMode,
  DEFAULT_TOOL_PANEL_MODE,
} from "@app/constants/toolPanel";
import { type ThemeMode } from "@app/constants/theme";

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

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
  defaultStartupView: StartupView;
  defaultViewerZoom: ViewerZoomSetting;
  theme: ThemeMode;
  toolPanelModePromptSeen: boolean;
  hasSelectedToolPanelMode: boolean;
  showLegacyToolDescriptions: boolean;
  hasCompletedOnboarding: boolean;
  hasSeenIntroOnboarding: boolean;
  hasSeenCookieBanner: boolean;
  hideUnavailableTools: boolean;
  hideUnavailableConversions: boolean;
  pdfRenderMode: PdfRenderMode;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  defaultToolPanelMode: DEFAULT_TOOL_PANEL_MODE,
  defaultStartupView: "tools",
  defaultViewerZoom: "auto",
  theme: "system",
  toolPanelModePromptSeen: false,
  hasSelectedToolPanelMode: false,
  showLegacyToolDescriptions: false,
  hasCompletedOnboarding: false,
  hasSeenIntroOnboarding: false,
  hasSeenCookieBanner: false,
  hideUnavailableTools: false,
  hideUnavailableConversions: false,
  pdfRenderMode: "normal",
};

const STORAGE_KEY = "stirlingpdf_preferences";

class PreferencesService {
  private serverDefaults: Partial<UserPreferences> = {};
  // False until a real /app-config has been applied, so a launch can tell "not
  // loaded yet" apart from "loaded, and the server's choice is the hardcoded
  // one". Callers must not set this for a stand-in config: the launch treats
  // the flag as "the server has answered" and would lock in "tools".
  private serverDefaultsInstalled = false;

  setServerDefaults(defaults: Partial<UserPreferences>): void {
    this.serverDefaults = defaults;
    this.serverDefaultsInstalled = true;
  }

  hasServerDefaults(): boolean {
    return this.serverDefaultsInstalled;
  }

  clearServerDefaults(): void {
    this.serverDefaults = {};
    this.serverDefaultsInstalled = false;
  }

  // A missing key is not a choice: it falls through to the server default.
  hasStoredPreference<K extends keyof UserPreferences>(key: K): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;
      const preferences = JSON.parse(stored) as Partial<UserPreferences>;
      return key in preferences && preferences[key] !== undefined;
    } catch {
      return false;
    }
  }

  getPreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    // Explicitly re-read every time in case preferences have changed in another tab etc.
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        if (key in preferences && preferences[key] !== undefined) {
          return preferences[key];
        }
      }
    } catch (error) {
      console.error("Error reading preference:", key, error);
    }
    // Use server defaults if available, otherwise use hardcoded defaults
    if (key in this.serverDefaults && this.serverDefaults[key] !== undefined) {
      return this.serverDefaults[key];
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
