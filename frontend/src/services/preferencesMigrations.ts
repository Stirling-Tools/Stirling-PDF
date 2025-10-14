import { isToolPanelMode, type ToolPanelMode } from '../constants/toolPanel';
import { isThemeMode, type ThemeMode } from '../constants/theme';

/**
 * Enum representing all preference versions
 * Note: Only add a new version number if removing/modifying existing keys. Additive changes can just modify the current interface.
 */
export enum PreferencesVersion {
  V0, // Legacy individual localStorage keys
  V1, // Unified preferences structure
}
type NoV0 = Exclude<PreferencesVersion, PreferencesVersion.V0>;

/**
 * Type representing preferences at different versions.
 * Add new version types as the schema evolves.
 */
export type PreferencesV0 = Record<string, unknown>; // V0 had no preferences in main structure (they were scattered around)
export interface PreferencesV1 {
  version: PreferencesVersion;
  autoUnzip: boolean;
  autoUnzipFileLimit: number;
  defaultToolPanelMode: ToolPanelMode;
  theme: ThemeMode;
  toolPanelModePromptSeen: boolean;
  showLegacyToolDescriptions: boolean;
}

/**
 * Type representing any version of preferences
 */
export type VersionedPreferences = (readonly [
  PreferencesV0,
  PreferencesV1,
])[number];

/**
 * The current version of preferences
 */
export type CurrentPreferences = PreferencesV1;

/**
 * The current version of the preferences schema
 */
export const CURRENT_PREFERENCES_VERSION = PreferencesVersion.V1;

/**
 * Migration function signature
 */
type MigrationFunction<TFrom extends Partial<VersionedPreferences>, TTo extends Partial<VersionedPreferences>> = (data: TFrom) => TTo;

/**
 * Migrates from V0 (legacy localStorage keys) to V1 (unified preferences)
 *
 * This migration:
 * - Reads old individual localStorage keys
 * - Combines them into unified preferences structure
 * - Adds version number
 * - Cleans up old keys after successful migration
 */
export const migrateV0toV1: MigrationFunction<
  Partial<PreferencesV0>,
  Partial<PreferencesV1>
> = (existingData) => {
  const migrations: Partial<PreferencesV1> = {
    ...existingData,
    version: PreferencesVersion.V1,
  };

  // Migrate old theme key
  const oldTheme = localStorage.getItem('stirling-theme');
  if (oldTheme && isThemeMode(oldTheme)) {
    migrations.theme = oldTheme;
  }

  // Migrate old tool panel mode preference
  const oldToolPanelMode = localStorage.getItem('toolPanelModePreference');
  if (oldToolPanelMode && isToolPanelMode(oldToolPanelMode)) {
    migrations.defaultToolPanelMode = oldToolPanelMode;
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

  return migrations;
};

/**
 * Cleans up legacy localStorage keys after successful migration to V1
 */
export const cleanupV0Keys = (): void => {
  localStorage.removeItem('stirling-theme');
  localStorage.removeItem('toolPanelModePreference');
  localStorage.removeItem('toolPanelModePromptSeen');
  localStorage.removeItem('legacyToolDescriptions');
};

/**
 * Registry of all migration functions, indexed by target version
 * TypeScript will enforce that all enum values have a migration function
 */
const MIGRATIONS: Record<
  NoV0,
  (data: Partial<VersionedPreferences>) => Partial<VersionedPreferences>
> = {
  [PreferencesVersion.V1]: migrateV0toV1,
};

/**
 * Registry of cleanup functions for legacy data, indexed by version
 */
const CLEANUPS: Record<NoV0, () => void> = {
  [PreferencesVersion.V1]: cleanupV0Keys,
};

/**
 * Runs all necessary migrations to bring preferences to the current version
 *
 * @param currentVersion - The version of the existing preferences (0 if none exist)
 * @param existingData - The existing preferences data (empty object if none exist)
 * @returns Migrated preferences at the current version
 */
export const runMigrations = (
  currentVersion: PreferencesVersion,
  existingData: Partial<VersionedPreferences>
): Partial<CurrentPreferences> => {
  let migratedData: Partial<VersionedPreferences> = { ...existingData };

  // Apply each migration sequentially from currentVersion to CURRENT_PREFERENCES_VERSION
  for (let version = currentVersion + 1 as NoV0; version <= CURRENT_PREFERENCES_VERSION; version++) {
    const migrationFn = MIGRATIONS[version];

    if (!migrationFn) {
      console.warn(`No migration function found for version ${version}`);
      continue;
    }

    console.log(`Running migration to version ${version}`);
    migratedData = migrationFn(migratedData);
    migratedData.version = version;

    // Run cleanup for this version if it exists
    const cleanupFn = CLEANUPS[version];
    if (cleanupFn) {
      cleanupFn();
    }
  }

  return migratedData as Partial<CurrentPreferences>;
};

/**
 * Checks if preferences need migration
 *
 * @param version - Current version of stored preferences (0 if none exist)
 * @returns True if migration is needed, false otherwise
 */
export const needsMigration = (version: PreferencesVersion): boolean => {
  return version < CURRENT_PREFERENCES_VERSION;
};
