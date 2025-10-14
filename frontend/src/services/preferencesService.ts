import { DEFAULT_TOOL_PANEL_MODE } from '../constants/toolPanel';
import { getSystemTheme } from '../constants/theme';
import {
  PreferencesVersion,
  CURRENT_PREFERENCES_VERSION,
  runMigrations,
  needsMigration,
  type CurrentPreferences,
} from './preferencesMigrations';

export type UserPreferences = CurrentPreferences;

export const DEFAULT_PREFERENCES: UserPreferences = {
  version: CURRENT_PREFERENCES_VERSION,
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
      let preferences: Partial<CurrentPreferences>;

      if (stored) {
        preferences = JSON.parse(stored) as Partial<CurrentPreferences>;
        const currentVersion = (preferences.version ?? PreferencesVersion.V0) as PreferencesVersion;

        // Check if migration is needed
        if (needsMigration(currentVersion)) {
          console.log(`Migrating preferences from version ${currentVersion} to ${CURRENT_PREFERENCES_VERSION}`);
          preferences = runMigrations(currentVersion, preferences);

          // Save migrated preferences
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
          } catch (error) {
            console.error('Error saving migrated preferences:', error);
          }
        }
      } else {
        // No stored preferences - check for legacy keys and migrate
        preferences = runMigrations(PreferencesVersion.V0, {});

        // Save migrated preferences (at minimum, the version number)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        } catch (error) {
          console.error('Error saving migrated preferences:', error);
        }
      }

      // Merge with defaults to ensure all preferences exist
      return {
        ...DEFAULT_PREFERENCES,
        ...preferences,
      };
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
