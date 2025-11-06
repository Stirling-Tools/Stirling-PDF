import { useState } from 'react';
import apiClient from '@app/services/apiClient';
import { mergePendingSettings, isFieldPending, hasPendingChanges, SettingsWithPending } from '@app/utils/settingsPendingHelper';

type SettingsRecord = Record<string, unknown>;
type CombinedSettings<T extends object> = T & SettingsRecord;
type PendingSettings<T extends object> = SettingsWithPending<CombinedSettings<T>> & CombinedSettings<T>;

interface UseAdminSettingsOptions<T extends object> {
  sectionName: string;
  /**
   * Optional transformer to combine data from multiple endpoints.
   * If not provided, uses the section response directly.
   */
  fetchTransformer?: () => Promise<T>;
  /**
   * Optional transformer to split settings before saving.
   * Returns an object with sectionData and optionally deltaSettings.
   */
  saveTransformer?: (settings: T) => {
    sectionData: T;
    deltaSettings?: SettingsRecord;
  };
}

interface UseAdminSettingsReturn<T extends object> {
  settings: T;
  rawSettings: PendingSettings<T> | null;
  loading: boolean;
  saving: boolean;
  setSettings: (settings: T) => void;
  fetchSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  isFieldPending: (fieldPath: string) => boolean;
  hasPendingChanges: () => boolean;
}

/**
 * Hook for managing admin settings with automatic pending changes support.
 * Includes delta detection to only send changed fields.
 *
 * @example
 * const { settings, setSettings, saveSettings, isFieldPending } = useAdminSettings({
 *   sectionName: 'legal'
 * });
*/
export function useAdminSettings<T extends object>(
  options: UseAdminSettingsOptions<T>
): UseAdminSettingsReturn<T> {
  const { sectionName, fetchTransformer, saveTransformer } = options;

  const [settings, setSettings] = useState<T>({} as T);
  const [rawSettings, setRawSettings] = useState<PendingSettings<T> | null>(null);
  const [originalSettings, setOriginalSettings] = useState<T>({} as T); // Track original active values
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = async () => {
    try {
      setLoading(true);

      let rawData: PendingSettings<T>;

      if (fetchTransformer) {
        // Use custom fetch logic for complex sections
        rawData = (await fetchTransformer()) as PendingSettings<T>;
      } else {
        // Simple single-endpoint fetch
        const response = await apiClient.get(`/api/v1/admin/settings/section/${sectionName}`);
        rawData = (response.data || {}) as PendingSettings<T>;
      }

      console.log(`[useAdminSettings:${sectionName}] Raw response:`, JSON.stringify(rawData, null, 2));

      // Store raw settings (includes _pending if present)
      setRawSettings(rawData);

      // Extract active settings (without _pending) for delta comparison
      const { _pending, ...activeOnly } = rawData;
      setOriginalSettings(activeOnly as T);
      console.log(`[useAdminSettings:${sectionName}] Original active settings:`, JSON.stringify(activeOnly, null, 2));

      // Merge pending changes into settings for display
      const mergedSettings = mergePendingSettings(rawData) as unknown as CombinedSettings<T>;
      console.log(`[useAdminSettings:${sectionName}] Merged settings:`, JSON.stringify(mergedSettings, null, 2));

      setSettings(mergedSettings as T);
    } catch (error) {
      console.error(`[useAdminSettings:${sectionName}] Failed to fetch:`, error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);

      // Compute delta: only include fields that changed from original
      const delta = computeDelta(
        originalSettings as SettingsRecord,
        settings as SettingsRecord
      );
      console.log(`[useAdminSettings:${sectionName}] Delta (changed fields):`, JSON.stringify(delta, null, 2));

      if (Object.keys(delta).length === 0) {
        console.log(`[useAdminSettings:${sectionName}] No changes detected, skipping save`);
        return;
      }

      if (saveTransformer) {
        // Use custom save logic for complex sections
        const { sectionData, deltaSettings } = saveTransformer(settings);

        // Save section data (with delta applied)
        const sectionDelta = computeDelta(
          originalSettings as SettingsRecord,
          sectionData as unknown as SettingsRecord
        );
        if (Object.keys(sectionDelta).length > 0) {
          await apiClient.put(`/api/v1/admin/settings/section/${sectionName}`, sectionDelta);
        }

        // Save delta settings if provided
        if (deltaSettings && Object.keys(deltaSettings).length > 0) {
          await apiClient.put('/api/v1/admin/settings', { settings: deltaSettings });
        }
      } else {
        // Simple single-endpoint save with delta
        await apiClient.put(`/api/v1/admin/settings/section/${sectionName}`, delta);
      }

      // Refetch to get updated _pending block
      await fetchSettings();
    } catch (error) {
      console.error(`[useAdminSettings:${sectionName}] Failed to save:`, error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    rawSettings,
    loading,
    saving,
    setSettings,
    fetchSettings,
    saveSettings,
    isFieldPending: (fieldPath: string) => isFieldPending(rawSettings, fieldPath),
    hasPendingChanges: () => hasPendingChanges(rawSettings),
  };
}

/**
 * Compute delta between original and current settings.
 * Returns only fields that have changed.
 */
function computeDelta(original: SettingsRecord, current: SettingsRecord): SettingsRecord {
  const delta: SettingsRecord = {};

  for (const key in current) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) continue;

    const originalValue = original[key];
    const currentValue = current[key];

    // Handle nested objects
    if (isPlainObject(currentValue) && isPlainObject(originalValue)) {
      const nestedDelta = computeDelta(originalValue, currentValue);
      if (Object.keys(nestedDelta).length > 0) {
        delta[key] = nestedDelta;
      }
    }
    // Handle arrays
    else if (Array.isArray(currentValue) && Array.isArray(originalValue)) {
      if (JSON.stringify(currentValue) !== JSON.stringify(originalValue)) {
        delta[key] = currentValue;
      }
    }
    // Handle primitives
    else if (currentValue !== originalValue) {
      delta[key] = currentValue;
    }
  }

  return delta;
}

/**
 * Check if value is a plain object (not array, not null, not Date, etc.)
 */
function isPlainObject(value: unknown): value is SettingsRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === Object
  );
}
