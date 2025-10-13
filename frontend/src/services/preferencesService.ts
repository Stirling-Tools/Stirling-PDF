import { ToolPanelMode, DEFAULT_TOOL_PANEL_MODE } from '../contexts/toolWorkflow/toolWorkflowState';

export type ThemeMode = 'light' | 'dark' | 'rainbow';

// Detect OS theme preference
function getSystemTheme(): 'light' | 'dark' {
  return window?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
  theme: ThemeMode;
  toolPanelModePromptSeen: boolean;
  showLegacyToolDescriptions: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  defaultToolPanelMode: DEFAULT_TOOL_PANEL_MODE,
  theme: getSystemTheme(),
  toolPanelModePromptSeen: false,
  showLegacyToolDescriptions: false,
};

const STORAGE_KEY = 'stirlingpdf_preferences';

class PreferencesService {
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
      return DEFAULT_PREFERENCES[key];
    } catch (error) {
      console.error('Error reading preference:', key, error);
      return DEFAULT_PREFERENCES[key];
    }
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
      throw error;
    }
  }

  getAllPreferences(): UserPreferences {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        // Merge with defaults to ensure all preferences exist
        return {
          ...DEFAULT_PREFERENCES,
          ...preferences,
        };
      }

      // Migration: Check for old localStorage keys and migrate them
      const migrations: Partial<UserPreferences> = {};

      // Migrate old theme key
      const oldTheme = localStorage.getItem('stirling-theme');
      if (oldTheme && ['light', 'dark', 'rainbow'].includes(oldTheme)) {
        migrations.theme = oldTheme as ThemeMode;
      }

      // Migrate old tool panel mode preference
      const oldToolPanelMode = localStorage.getItem('toolPanelModePreference');
      if (oldToolPanelMode && ['sidebar', 'fullscreen'].includes(oldToolPanelMode)) {
        migrations.defaultToolPanelMode = oldToolPanelMode as ToolPanelMode;
      }

      // Migrate old tool panel mode prompt seen flag
      const oldPromptSeen = localStorage.getItem('toolPanelModePromptSeen');
      if (oldPromptSeen === 'true') {
        migrations.toolPanelModePromptSeen = true;
      }

      // Migrate old legacy tool descriptions preference
      const oldLegacyDescriptions = localStorage.getItem('legacyToolDescriptions');
      if (oldLegacyDescriptions === 'true') {
        migrations.showLegacyToolDescriptions = true;
      }

      const migratedPreferences = {
        ...DEFAULT_PREFERENCES,
        ...migrations,
      };

      // If we migrated any values, save them to the new unified key
      if (Object.keys(migrations).length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedPreferences));

        // Clean up old keys
        localStorage.removeItem('stirling-theme');
        localStorage.removeItem('toolPanelModePreference');
        localStorage.removeItem('toolPanelModePromptSeen');
        localStorage.removeItem('legacyToolDescriptions');
      }

      return migratedPreferences;
    } catch (error) {
      console.error('Error reading all preferences:', error);
      return { ...DEFAULT_PREFERENCES };
    }
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
