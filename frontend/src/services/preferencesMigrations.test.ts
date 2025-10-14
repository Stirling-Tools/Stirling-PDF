import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PreferencesVersion,
  CURRENT_PREFERENCES_VERSION,
  migrateV0toV1,
  cleanupV0Keys,
  runMigrations,
  needsMigration,
} from './preferencesMigrations';

describe('preferencesMigrations', () => {
  // Store original localStorage
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear any console mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore localStorage
    global.localStorage = originalLocalStorage;
  });

  describe('migrateV0toV1', () => {
    test.each([
      { legacyKey: 'stirling-theme', legacyValue: 'dark', resultKey: 'theme', resultValue: 'dark' },
      { legacyKey: 'toolPanelModePreference', legacyValue: 'fullscreen', resultKey: 'defaultToolPanelMode', resultValue: 'fullscreen' },
      { legacyKey: 'toolPanelModePromptSeen', legacyValue: 'true', resultKey: 'toolPanelModePromptSeen', resultValue: true },
      { legacyKey: 'legacyToolDescriptions', legacyValue: 'true', resultKey: 'showLegacyToolDescriptions', resultValue: true },
    ])('should migrate $legacyKey from legacy key', ({ legacyKey, legacyValue, resultKey, resultValue }) => {
      localStorage.setItem(legacyKey, legacyValue);

      const result = migrateV0toV1({});

      expect(result.version).toBe(PreferencesVersion.V1);
      expect(result[resultKey as keyof typeof result]).toBe(resultValue);
    });

    test('should migrate all legacy keys together', () => {
      localStorage.setItem('stirling-theme', 'rainbow');
      localStorage.setItem('toolPanelModePreference', 'sidebar');
      localStorage.setItem('toolPanelModePromptSeen', 'true');
      localStorage.setItem('legacyToolDescriptions', 'true');

      const result = migrateV0toV1({});

      expect(result).toEqual({
        version: PreferencesVersion.V1,
        theme: 'rainbow',
        defaultToolPanelMode: 'sidebar',
        toolPanelModePromptSeen: true,
        showLegacyToolDescriptions: true,
      });
    });

    test('should only set version when no legacy keys exist', () => {
      const result = migrateV0toV1({});

      expect(result).toEqual({
        version: PreferencesVersion.V1,
      });
    });

    test.each([
      { legacyKey: 'stirling-theme', invalidValue: 'invalid-theme', resultKey: 'theme' },
      { legacyKey: 'toolPanelModePreference', invalidValue: 'invalid-mode', resultKey: 'defaultToolPanelMode' },
    ])('should ignore invalid $legacyKey values', ({ legacyKey, invalidValue, resultKey }) => {
      localStorage.setItem(legacyKey, invalidValue);

      const result = migrateV0toV1({});

      expect(result[resultKey as keyof typeof result]).toBeUndefined();
      expect(result.version).toBe(PreferencesVersion.V1);
    });
  });

  describe('cleanupV0Keys', () => {
    test('should remove all legacy localStorage keys', () => {
      localStorage.setItem('stirling-theme', 'dark');
      localStorage.setItem('toolPanelModePreference', 'sidebar');
      localStorage.setItem('toolPanelModePromptSeen', 'true');
      localStorage.setItem('legacyToolDescriptions', 'true');
      localStorage.setItem('some-other-key', 'value'); // Should not be removed

      cleanupV0Keys();

      expect(localStorage.getItem('stirling-theme')).toBeNull();
      expect(localStorage.getItem('toolPanelModePreference')).toBeNull();
      expect(localStorage.getItem('toolPanelModePromptSeen')).toBeNull();
      expect(localStorage.getItem('legacyToolDescriptions')).toBeNull();
      expect(localStorage.getItem('some-other-key')).toBe('value');
    });

    test('should not throw when keys do not exist', () => {
      expect(() => cleanupV0Keys()).not.toThrow();
    });
  });

  describe('runMigrations', () => {
    test('should migrate from V0 to V1', () => {
      localStorage.setItem('stirling-theme', 'dark');
      localStorage.setItem('toolPanelModePreference', 'fullscreen');

      const result = runMigrations(PreferencesVersion.V0, {});

      expect(result.version).toBe(PreferencesVersion.V1);
      expect(result.theme).toBe('dark');
      expect(result.defaultToolPanelMode).toBe('fullscreen');
    });

    test('should cleanup legacy keys after migration', () => {
      localStorage.setItem('stirling-theme', 'dark');
      localStorage.setItem('toolPanelModePreference', 'sidebar');

      runMigrations(PreferencesVersion.V0, {});

      expect(localStorage.getItem('stirling-theme')).toBeNull();
      expect(localStorage.getItem('toolPanelModePreference')).toBeNull();
    });

    test('should not run migration if already at current version', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const existingData = { version: PreferencesVersion.V1, theme: 'light' as const };

      const result = runMigrations(PreferencesVersion.V1, existingData);

      expect(result).toEqual(existingData);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test('should preserve existing data during migration', () => {
      localStorage.setItem('stirling-theme', 'dark');
      const existingData = { autoUnzip: false };

      const result = runMigrations(PreferencesVersion.V0, existingData);

      expect(result.autoUnzip).toBe(false);
      expect(result.theme).toBe('dark');
      expect(result.version).toBe(PreferencesVersion.V1);
    });

    test('should handle multiple sequential migrations', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      localStorage.setItem('stirling-theme', 'rainbow');

      runMigrations(PreferencesVersion.V0, {});

      expect(consoleSpy).toHaveBeenCalledWith('Running migration to version 1');
    });
  });

  describe('needsMigration', () => {
    test.each([
      { version: PreferencesVersion.V0, expected: true, description: 'less than current' },
      { version: CURRENT_PREFERENCES_VERSION, expected: false, description: 'equals current' },
      { version: (CURRENT_PREFERENCES_VERSION + 1) as PreferencesVersion, expected: false, description: 'greater than current' },
    ])('should return $expected when version is $description', ({ version, expected }) => {
      expect(needsMigration(version)).toBe(expected);
    });
  });

  describe('migration idempotency', () => {
    test('should produce same result when run twice with same input', () => {
      // Set up legacy keys once
      localStorage.setItem('stirling-theme', 'dark');
      localStorage.setItem('toolPanelModePreference', 'sidebar');

      const firstRun = runMigrations(PreferencesVersion.V0, {});

      // Re-add legacy keys for second run since cleanup removed them
      localStorage.setItem('stirling-theme', 'dark');
      localStorage.setItem('toolPanelModePreference', 'sidebar');

      const secondRun = runMigrations(PreferencesVersion.V0, {});

      expect(firstRun).toEqual(secondRun);
    });

    test('should not re-migrate when already at current version', () => {
      const currentPreferences = {
        version: PreferencesVersion.V1,
        theme: 'dark' as const,
      };

      const result = runMigrations(PreferencesVersion.V1, currentPreferences);

      // Should return the same data unchanged
      expect(result).toEqual(currentPreferences);
    });
  });
});
