import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { alert } from '@app/components/toast';
import { SignRequestSummary, SessionSummary } from '@app/types/signingSession';

export interface UseSigningSessionsOptions {
  enabled?: boolean;
  autoRefreshInterval?: number; // milliseconds, 0 to disable
}

export interface UseSigningSessionsResult {
  signRequests: SignRequestSummary[];
  mySessions: SessionSummary[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch signing sessions data (sign requests and user's sessions).
 * Supports auto-refresh for real-time updates.
 */
export const useSigningSessions = (
  options: UseSigningSessionsOptions = {}
): UseSigningSessionsResult => {
  const { enabled = true, autoRefreshInterval = 0 } = options;
  const { t } = useTranslation();

  const [signRequests, setSignRequests] = useState<SignRequestSummary[]>([]);
  const [mySessions, setMySessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const [requestsResponse, sessionsResponse] = await Promise.all([
        apiClient.get<SignRequestSummary[]>('/api/v1/security/cert-sign/sign-requests'),
        apiClient.get<SessionSummary[]>('/api/v1/security/cert-sign/sessions'),
      ]);

      setSignRequests(requestsResponse.data);
      setMySessions(sessionsResponse.data);
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error('Failed to fetch signing data');
      setError(errorObj);
      console.error('Failed to fetch signing data:', err);

      alert({
        alertType: 'warning',
        title: t('error'),
        body: t('certSign.fetchFailed', 'Failed to load signing data'),
        expandable: false,
        durationMs: 2500,
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, t]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!enabled || !autoRefreshInterval || autoRefreshInterval <= 0) {
      return;
    }

    const interval = setInterval(() => {
      fetchData();
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [enabled, autoRefreshInterval, fetchData]);

  return {
    signRequests,
    mySessions,
    loading,
    error,
    refetch: fetchData,
  };
};
