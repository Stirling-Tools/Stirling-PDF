import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminSection, putAdminSection, putAdminSettings } from "@app/api/adminSettings";
import { qk } from "@app/query/keys";
import { mergePendingSettings, isFieldPending, hasPendingChanges } from "@app/utils/settingsPendingHelper";

interface UseAdminSettingsOptions<T> {
  sectionName: string;
  enabled?: boolean;
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
    sectionData: any;
    deltaSettings?: Record<string, any>;
  };
}

interface UseAdminSettingsReturn<T> {
  settings: T;
  rawSettings: any;
  loading: boolean;
  saving: boolean;
  setSettings: (settings: T) => void;
  saveSettings: () => Promise<void>;
  isFieldPending: (fieldPath: string) => boolean;
  hasPendingChanges: () => boolean;
}

/**
 * One config section: the server value, an editable draft over it, and a save
 * that sends only what changed. Sections sharing a sectionName share the fetch.
 */
export function useAdminSettings<T = any>(options: UseAdminSettingsOptions<T>): UseAdminSettingsReturn<T> {
  const { sectionName, enabled = true, fetchTransformer, saveTransformer } = options;

  const queryClient = useQueryClient();
  const queryKey = qk.adminSection(sectionName);

  // Inline closures at the call sites, so their identity changes every render.
  const fetchTransformerRef = useRef(fetchTransformer);
  fetchTransformerRef.current = fetchTransformer;
  const saveTransformerRef = useRef(saveTransformer);
  saveTransformerRef.current = saveTransformer;

  const {
    data: rawSettings,
    isPending,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () => (fetchTransformerRef.current ? fetchTransformerRef.current() : fetchAdminSection<T>(sectionName)),
    enabled,
    // Inherits the client's 30s window. Not CONFIG_STALE_TIME: these are
    // editable, and a save invalidates. Override it for live server state.
  });

  // Pending changes folded in: what the form shows, and the delta baseline.
  const baseline = useMemo(() => (rawSettings ? (mergePendingSettings(rawSettings) as T) : ({} as T)), [rawSettings]);

  // Adjusted during render, not in an effect: React re-runs the component
  // before committing, so reseeding costs no extra render.
  const [draft, setDraft] = useState<T>(baseline);
  const seededFrom = useRef(rawSettings);
  if (rawSettings !== undefined && seededFrom.current !== rawSettings) {
    seededFrom.current = rawSettings;
    setDraft(baseline);
  }

  const save = useMutation({
    mutationFn: async () => {
      const delta = computeDelta(baseline, draft);
      if (Object.keys(delta).length === 0) return;

      const transform = saveTransformerRef.current;
      if (!transform) {
        await putAdminSection(sectionName, delta);
        return;
      }

      const { sectionData, deltaSettings } = transform(draft);
      const { sectionData: originalSectionData, deltaSettings: originalDelta } = transform(baseline);

      const sectionDelta = computeDelta(originalSectionData, sectionData);
      if (Object.keys(sectionDelta).length > 0) {
        await putAdminSection(sectionName, sectionDelta);
      }

      if (deltaSettings && Object.keys(deltaSettings).length > 0) {
        const changed: Record<string, any> = {};
        for (const [key, value] of Object.entries(deltaSettings)) {
          if (JSON.stringify(value) !== JSON.stringify(originalDelta?.[key])) {
            changed[key] = value;
          }
        }
        if (Object.keys(changed).length > 0) await putAdminSettings(changed);
      }
    },
    // Refetch rather than trust the draft: the response carries the _pending
    // block the badges render from.
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const saveSettings = useCallback(async () => {
    await save.mutateAsync();
  }, [save]);

  return {
    settings: draft,
    rawSettings: rawSettings ?? null,
    // True while disabled too: nothing has loaded.
    loading: isPending || isFetching,
    saving: save.isPending,
    setSettings: setDraft,
    saveSettings,
    isFieldPending: (fieldPath: string) => isFieldPending(rawSettings as any, fieldPath),
    hasPendingChanges: () => hasPendingChanges(rawSettings as any),
  };
}

/**
 * Compute delta between original and current settings.
 * Returns only fields that have changed.
 */
function computeDelta(original: any, current: any): any {
  const delta: any = {};

  for (const key in current) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) continue;

    const originalValue = original?.[key];
    const currentValue = current[key];

    if (isPlainObject(currentValue) && isPlainObject(originalValue)) {
      const nestedDelta = computeDelta(originalValue, currentValue);
      if (Object.keys(nestedDelta).length > 0) {
        delta[key] = nestedDelta;
      }
    } else if (Array.isArray(currentValue) && Array.isArray(originalValue)) {
      if (JSON.stringify(currentValue) !== JSON.stringify(originalValue)) {
        delta[key] = currentValue;
      }
    } else if (currentValue !== originalValue) {
      delta[key] = currentValue;
    }
  }

  return delta;
}

/**
 * Check if value is a plain object (not array, not null, not Date, etc.)
 */
function isPlainObject(value: any): boolean {
  return value !== null && typeof value === "object" && value.constructor === Object;
}
