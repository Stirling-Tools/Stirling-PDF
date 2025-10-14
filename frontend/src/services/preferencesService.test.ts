import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { preferencesService, DEFAULT_PREFERENCES } from './preferencesService';
import { PreferencesVersion, CURRENT_PREFERENCES_VERSION } from './preferencesMigrations';

describe('PreferencesService', () => {
  const STORAGE_KEY = 'stirlingpdf_preferences';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getPreference', () => {
    test('should return default value when no preferences stored', () => {
      const theme = preferencesService.getPreference('theme');
      expect(theme).toBe(DEFAULT_PREFERENCES.theme);
    });

    test('should return stored value when preference exists', () => {
      const preferences = { ...DEFAULT_PREFERENCES, theme: 'dark' as const };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

      const theme = preferencesService.getPreference('theme');
      expect(theme).toBe('dark');
    });

    test('should return default value when key not in stored preferences', () => {
      const preferences = { theme: 'dark' as const };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

      const autoUnzip = preferencesService.getPreference('autoUnzip');
      expect(autoUnzip).toBe(DEFAULT_PREFERENCES.autoUnzip);
    });

    test('should handle malformed JSON gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid json{');

      const theme = preferencesService.getPreference('theme');
      expect(theme).toBe(DEFAULT_PREFERENCES.theme);
    });

    test('should re-read from localStorage each time', () => {
      const preferences1 = { ...DEFAULT_PREFERENCES, theme: 'dark' as const };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences1));

      expect(preferencesService.getPreference('theme')).toBe('dark');

      // Simulate another tab changing the preference
      const preferences2 = { ...DEFAULT_PREFERENCES, theme: 'light' as const };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences2));

      expect(preferencesService.getPreference('theme')).toBe('light');
    });
  });

  describe('setPreference', () => {
    test('should save preference to localStorage', () => {
      preferencesService.setPreference('theme', 'dark');

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.theme).toBe('dark');
    });

    test('should update existing preferences without overwriting others', () => {
      preferencesService.setPreference('theme', 'dark');
      preferencesService.setPreference('autoUnzip', false);

      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(stored!);
      expect(parsed.theme).toBe('dark');
      expect(parsed.autoUnzip).toBe(false);
    });

    test('should handle localStorage being full', () => {
      // Mock setItem to throw
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => {
        preferencesService.setPreference('theme', 'dark');
      }).toThrow();

      setItemSpy.mockRestore();
    });
  });

  describe('getAllPreferences', () => {
    test('should return default preferences when nothing stored', () => {
      const preferences = preferencesService.getAllPreferences();
      expect(preferences).toEqual(DEFAULT_PREFERENCES);
    });

    test('should return stored preferences merged with defaults', () => {
      const stored = { version: CURRENT_PREFERENCES_VERSION, theme: 'dark' as const };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

      const preferences = preferencesService.getAllPreferences();
      expect(preferences.theme).toBe('dark');
      expect(preferences.autoUnzip).toBe(DEFAULT_PREFERENCES.autoUnzip);
      expect(preferences.version).toBe(CURRENT_PREFERENCES_VERSION);
    });

    test('should migrate from V0 legacy keys', () => {
      localStorage.setItem('stirling-theme', 'rainbow');
      localStorage.setItem('toolPanelModePreference', 'fullscreen');

      const preferences = preferencesService.getAllPreferences();

      expect(preferences.theme).toBe('rainbow');
      expect(preferences.defaultToolPanelMode).toBe('fullscreen');
      expect(preferences.version).toBe(PreferencesVersion.V1);

      // Legacy keys should be cleaned up
      expect(localStorage.getItem('stirling-theme')).toBeNull();
      expect(localStorage.getItem('toolPanelModePreference')).toBeNull();
    });

    test('should save migrated preferences to new key', () => {
      localStorage.setItem('stirling-theme', 'dark');

      preferencesService.getAllPreferences();

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.theme).toBe('dark');
      expect(parsed.version).toBe(PreferencesVersion.V1);
    });

    test('should save version number even when no legacy data exists', () => {
      preferencesService.getAllPreferences();

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.version).toBe(CURRENT_PREFERENCES_VERSION);
    });

    test('should handle JSON parse errors gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid json{');

      const preferences = preferencesService.getAllPreferences();
      expect(preferences).toEqual(DEFAULT_PREFERENCES);
    });

    test('should handle localStorage errors during migration save', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem('stirling-theme', 'dark');

      // Mock setItem to throw
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const preferences = preferencesService.getAllPreferences();

      // Should still return migrated preferences even if save fails
      expect(preferences.theme).toBe('dark');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error saving migrated preferences:',
        expect.any(Error)
      );

      setItemSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('should run migration when version is outdated', () => {
      const outdatedPreferences = {
        version: PreferencesVersion.V0,
        theme: 'light' as const,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(outdatedPreferences));

      const preferences = preferencesService.getAllPreferences();

      expect(preferences.version).toBe(CURRENT_PREFERENCES_VERSION);
    });

    test('should not run migration when version is current', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const currentPreferences = {
        ...DEFAULT_PREFERENCES,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPreferences));

      preferencesService.getAllPreferences();

      // Check that migration log was not called
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Migrating preferences')
      );
    });
  });

  describe('clearAllPreferences', () => {
    test('should remove preferences from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PREFERENCES));

      preferencesService.clearAllPreferences();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    test('should handle localStorage being unavailable', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
      removeItemSpy.mockImplementation(() => {
        throw new Error('localStorage is not available');
      });

      expect(() => {
        preferencesService.clearAllPreferences();
      }).toThrow();

      removeItemSpy.mockRestore();
    });

    test('should not throw when preferences do not exist', () => {
      expect(() => {
        preferencesService.clearAllPreferences();
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete workflow: set, get, clear', () => {
      preferencesService.setPreference('theme', 'dark');
      expect(preferencesService.getPreference('theme')).toBe('dark');

      preferencesService.clearAllPreferences();
      expect(preferencesService.getPreference('theme')).toBe(DEFAULT_PREFERENCES.theme);
    });

    test('should preserve version field when setting preferences', () => {
      preferencesService.setPreference('theme', 'dark');

      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(stored!);

      // Version should not be lost
      expect(parsed.theme).toBe('dark');
    });

    test('should handle migration and then updates', () => {
      // Start with legacy data
      localStorage.setItem('stirling-theme', 'rainbow');

      // Trigger migration via getAllPreferences
      const preferences = preferencesService.getAllPreferences();
      expect(preferences.theme).toBe('rainbow');

      // Now update a preference
      preferencesService.setPreference('autoUnzip', false);

      // Verify both migrated and new preference exist
      const updated = preferencesService.getAllPreferences();
      expect(updated.theme).toBe('rainbow');
      expect(updated.autoUnzip).toBe(false);
      expect(updated.version).toBe(CURRENT_PREFERENCES_VERSION);
    });
  });
});
