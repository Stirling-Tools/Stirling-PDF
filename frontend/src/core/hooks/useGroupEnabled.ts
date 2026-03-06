import { useState, useEffect } from 'react';
import apiClient from '@app/services/apiClient';

export interface GroupEnabledResult {
  enabled: boolean | null;
  /** Human-readable reason shown when the feature is unavailable. Null while loading or when enabled. */
  unavailableReason: string | null;
}

/**
 * Checks whether a named feature group is enabled on the backend.
 * Returns { enabled: null } while loading, then true/false with an optional reason.
 */
export function useGroupEnabled(group: string): GroupEnabledResult {
  const [result, setResult] = useState<GroupEnabledResult>({ enabled: null, unavailableReason: null });

  useEffect(() => {
    apiClient
      .get<boolean>(`/api/v1/config/group-enabled?group=${encodeURIComponent(group)}`)
      .then(res => setResult({ enabled: res.data, unavailableReason: null }))
      .catch(() => setResult({ enabled: false, unavailableReason: null }));
  }, [group]);

  return result;
}
