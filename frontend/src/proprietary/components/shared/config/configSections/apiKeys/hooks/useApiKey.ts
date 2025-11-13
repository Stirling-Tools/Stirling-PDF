import { useCallback, useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasAttempted, setHasAttempted] = useState<boolean>(false);

  const fetchKey = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Backend is POST for get and update
      const res = await apiClient.post("/api/v1/user/get-api-key");
      const value = typeof res.data === "string" ? res.data : res.data?.apiKey;
      if (typeof value === "string") setApiKey(value);
    } catch (e: any) {
      // If not found, try to create one by calling update endpoint
      if (e?.response?.status === 404) {
        try {
          const createRes = await apiClient.post("/api/v1/user/update-api-key");
          const created =
            typeof createRes.data === "string"
              ? createRes.data
              : createRes.data?.apiKey;
          if (typeof created === "string") setApiKey(created);
        } catch (createErr: any) {
          setError(createErr);
        }
      } else {
        setError(e);
      }
    } finally {
      setIsLoading(false);
      setHasAttempted(true);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await apiClient.post("/api/v1/user/update-api-key");
      const value = typeof res.data === "string" ? res.data : res.data?.apiKey;
      if (typeof value === "string") setApiKey(value);
    } catch (e: any) {
      setError(e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasAttempted) {
      fetchKey();
    }
  }, [hasAttempted, fetchKey]);

  return { apiKey, isLoading, isRefreshing, error, refetch: fetchKey, refresh, hasAttempted } as const;
}

export default useApiKey;
