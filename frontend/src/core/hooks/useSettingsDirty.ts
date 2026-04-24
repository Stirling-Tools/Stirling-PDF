import { useEffect, useState, useRef } from "react";
import { useUnsavedChanges } from "@app/contexts/UnsavedChangesContext";

interface UseSettingsDirtyReturn<T> {
  isDirty: boolean;
  resetToSnapshot: () => T;
  markSaved: () => void;
}

/**
 * Hook for managing dirty state in settings sections
 * Handles JSON snapshot comparison and UnsavedChangesContext integration
 */
export function useSettingsDirty<T>(
  settings: T,
  loading: boolean,
): UseSettingsDirtyReturn<T> {
  const { setIsDirty } = useUnsavedChanges();
  const [originalSettingsSnapshot, setOriginalSettingsSnapshot] =
    useState<string>("");
  const [isDirty, setLocalIsDirty] = useState(false);
  const isInitialLoad = useRef(true);
  const justSavedRef = useRef(false);

  // Snapshot original settings after initial load OR after successful save (when refetch completes)
  useEffect(() => {
    if (
      loading ||
      Object.keys(settings as Record<string, unknown>).length === 0
    )
      return;

    // After initial load: set snapshot
    if (isInitialLoad.current) {
      setOriginalSettingsSnapshot(JSON.stringify(settings));
      isInitialLoad.current = false;
      return;
    }

    // After save: update snapshot to new server state so dirty tracking is accurate
    if (justSavedRef.current) {
      setOriginalSettingsSnapshot(JSON.stringify(settings));
      setLocalIsDirty(false);
      setIsDirty(false);
      justSavedRef.current = false;
    }
  }, [loading, settings, setIsDirty]);

  // Track dirty state by comparing current settings to snapshot
  useEffect(() => {
    if (!originalSettingsSnapshot || loading) return;

    const currentSnapshot = JSON.stringify(settings);
    const dirty = currentSnapshot !== originalSettingsSnapshot;
    setLocalIsDirty(dirty);
    setIsDirty(dirty);
  }, [settings, originalSettingsSnapshot, loading, setIsDirty]);

  // Clean up dirty state on unmount
  useEffect(() => {
    return () => {
      setIsDirty(false);
    };
  }, [setIsDirty]);

  const resetToSnapshot = (): T => {
    if (originalSettingsSnapshot) {
      try {
        return JSON.parse(originalSettingsSnapshot) as T;
      } catch (e) {
        console.error("Failed to parse original settings:", e);
        return settings;
      }
    }
    return settings;
  };

  const markSaved = () => {
    justSavedRef.current = true;
  };

  return {
    isDirty,
    resetToSnapshot,
    markSaved,
  };
}
