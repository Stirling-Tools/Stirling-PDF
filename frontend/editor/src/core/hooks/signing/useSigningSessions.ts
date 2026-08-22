import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchSigningSessions } from "@app/api/signing";
import { qk } from "@app/query/keys";
import { alert } from "@app/components/toast";
import { SignRequestSummary, SessionSummary } from "@app/types/signingSession";

const EMPTY_REQUESTS: SignRequestSummary[] = [];
const EMPTY_SESSIONS: SessionSummary[] = [];

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
 * Signing sessions, shared across every consumer by query key — the badge, the
 * launcher and the sidebar controller each used to fetch their own copy.
 * Background polls never raise the spinner or a toast; only a first load or an
 * explicit refetch does.
 */
export const useSigningSessions = (
  options: UseSigningSessionsOptions = {},
): UseSigningSessionsResult => {
  const { enabled = true, autoRefreshInterval = 0 } = options;
  const { t } = useTranslation();

  const { data, isLoading, isLoadingError, error, refetch } = useQuery({
    queryKey: qk.signingSessions(),
    queryFn: fetchSigningSessions,
    enabled,
    staleTime: 0,
    refetchInterval: autoRefreshInterval > 0 ? autoRefreshInterval : false,
    refetchIntervalInBackground: false,
  });

  const notifyFailure = useCallback(() => {
    console.error("Failed to fetch signing data");
    alert({
      alertType: "warning",
      title: t("common.error"),
      body: t("certSign.fetchFailed", "Failed to load signing data"),
      expandable: false,
      durationMs: 2500,
    });
  }, [t]);

  // isLoadingError is "failed with nothing cached", i.e. a first load. A poll
  // that fails after a success keeps the old data and stays silent.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!isLoadingError) {
      reportedRef.current = false;
      return;
    }
    if (reportedRef.current) return;
    reportedRef.current = true;
    notifyFailure();
  }, [isLoadingError, notifyFailure]);

  // Neither isLoading nor isFetching alone matches the old `silent` flag: a
  // user-initiated refresh showed the spinner even with data on screen, a
  // background poll never did. isFetching cannot tell them apart, so track it.
  const [refreshing, setRefreshing] = useState(false);

  const explicitRefetch = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await refetch();
      // Reported here rather than by the effect: a user-initiated refresh
      // should say so even when stale data is already on screen.
      if (result.error && !reportedRef.current) notifyFailure();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, notifyFailure]);

  return {
    signRequests: data?.signRequests ?? EMPTY_REQUESTS,
    mySessions: data?.mySessions ?? EMPTY_SESSIONS,
    loading: isLoading || refreshing,
    error: (error as Error | null) ?? null,
    refetch: explicitRefetch,
  };
};
