import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminSection,
  putAdminSection,
  putAdminSettings,
} from "@app/api/adminSettings";
import { qk } from "@app/query/keys";
import {
  mergePendingSettings,
  isFieldPending,
  hasPendingChanges,
} from "@app/utils/settingsPendingHelper";

interface UseAdminSettingsOptions<T> {
  sectionName: string;
  /** Skips the fetch entirely — sections pass their login/permission gate here. */
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
  fetchSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  isFieldPending: (fieldPath: string) => boolean;
  hasPendingChanges: () => boolean;
}

/**
 * Admin settings for one config section: the server value, an editable draft on
 * top of it, and a save that sends only what changed.
 *
 * Sections sharing a sectionName share the fetch — four separate AI tabs all
 * read `aiEngine`.
 *
 * @example
 * const { settings, setSettings, saveSettings, isFieldPending } = useAdminSettings({
 *   sectionName: 'legal',
 *   enabled: loginEnabled,
 * });
 */
export function useAdminSettings<T = any>(
  options: UseAdminSettingsOptions<T>,
): UseAdminSettingsReturn<T> {
  const {
    sectionName,
    enabled = true,
    fetchTransformer,
    saveTransformer,
  } = options;

  const queryClient = useQueryClient();
  const queryKey = qk.adminSection(sectionName);

  // Transformers are inline closures, so they change identity every render;
  // the query must not treat that as a new fetcher.
  const fetchTransformerRef = useRef(fetchTransformer);
  fetchTransformerRef.current = fetchTransformer;
  const saveTransformerRef = useRef(saveTransformer);
  saveTransformerRef.current = saveTransformer;

  const {
    data: rawSettings,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () =>
      fetchTransformerRef.current
        ? fetchTransformerRef.current()
        : fetchAdminSection<T>(sectionName),
    enabled,
    staleTime: 0,
  });

  // What the user saw, pending changes folded in — also the delta baseline.
  const baseline = useMemo(
    () => (rawSettings ? (mergePendingSettings(rawSettings) as T) : ({} as T)),
    [rawSettings],
  );

  // Every fetch reseeds the draft, including the refetch after a save — the
  // response carries the _pending block the form renders from.
  const [draft, setDraft] = useState<T>(baseline);
  useEffect(() => {
    if (rawSettings !== undefined) setDraft(baseline);
  }, [rawSettings, baseline]);

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
      const { sectionData: originalSectionData, deltaSettings: originalDelta } =
        transform(baseline);

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
    // Refetch rather than trust the local draft: the response carries a fresh
    // _pending block the UI badges off.
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const fetchSettings = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const saveSettings = useCallback(async () => {
    await save.mutateAsync();
  }, [save]);

  return {
    settings: draft,
    rawSettings: rawSettings ?? null,
    // Also true while disabled, matching the old hook: nothing has loaded yet.
    loading: isPending || isFetching,
    saving: save.isPending,
    setSettings: setDraft,
    fetchSettings,
    saveSettings,
    isFieldPending: (fieldPath: string) =>
      isFieldPending(rawSettings as any, fieldPath),
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
  return (
    value !== null && typeof value === "object" && value.constructor === Object
  );
}
