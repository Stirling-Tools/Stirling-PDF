import { type ToolPanelMode, DEFAULT_TOOL_PANEL_MODE } from '@app/constants/toolPanel';
import { type ThemeMode, getSystemTheme } from '@app/constants/theme';

export type LogoVariant = 'modern' | 'classic';

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
  theme: ThemeMode;
  toolPanelModePromptSeen: boolean;
  hasSelectedToolPanelMode: boolean;
  showLegacyToolDescriptions: boolean;
  hasCompletedOnboarding: boolean;
  hasSeenIntroOnboarding: boolean;
  hasSeenCookieBanner: boolean;
  hideUnavailableTools: boolean;
  hideUnavailableConversions: boolean;
  logoVariant: LogoVariant | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  defaultToolPanelMode: DEFAULT_TOOL_PANEL_MODE,
  theme: getSystemTheme(),
  toolPanelModePromptSeen: false,
  hasSelectedToolPanelMode: false,
  showLegacyToolDescriptions: false,
  hasCompletedOnboarding: false,
  hasSeenIntroOnboarding: false,
  hasSeenCookieBanner: false,
  hideUnavailableTools: false,
  hideUnavailableConversions: false,
  logoVariant: null,
};

const STORAGE_KEY = 'stirlingpdf_preferences';

class PreferencesService {
  private serverDefaults: Partial<UserPreferences> = {};

  setServerDefaults(defaults: Partial<UserPreferences>): void {
    this.serverDefaults = defaults;
  }

  getPreference<K extends keyof UserPreferences>(
    key: K
  ): UserPreferences[K] {
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
      console.error('Error reading preference:', key, error);
    }
    // Use server defaults if available, otherwise use hardcoded defaults
    if (key in this.serverDefaults && this.serverDefaults[key] !== undefined) {
      return this.serverDefaults[key]!;
    }
    return DEFAULT_PREFERENCES[key];
  }

  setPreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const preferences = stored ? JSON.parse(stored) : {};
      preferences[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.error('Error writing preference:', key, error);
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
      console.error('Error reading preferences', error);
    }
    // Merge server defaults with hardcoded defaults
    return { ...DEFAULT_PREFERENCES, ...this.serverDefaults };
  }

  clearAllPreferences(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing preferences:', error);
      throw error;
    }
  }
}

export const preferencesService = new PreferencesService();
