import { ToolPanelMode } from 'src/contexts/toolWorkflow/toolWorkflowState';

export interface UserPreferences {
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  autoUnzip: true,
  autoUnzipFileLimit: 4,
  defaultToolPanelMode: 'sidebar',
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
      return { ...DEFAULT_PREFERENCES };
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
