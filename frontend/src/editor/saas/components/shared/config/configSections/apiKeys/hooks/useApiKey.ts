import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";

type ApiKeyResponse = string | { apiKey?: string };

export function useApiKey() {
  const { session, loading, user } = useAuth();
  const isAnonymous = Boolean(user && isUserAnonymous(user));
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
      const res = await apiClient.post<ApiKeyResponse>(
        "/api/v1/user/get-api-key",
      );
      const value = typeof res.data === "string" ? res.data : res.data.apiKey;
      if (typeof value === "string") setApiKey(value);
    } catch (e: unknown) {
      // If not found, try to create one by calling update endpoint
      if (isAxiosError(e) && e.response?.status === 404) {
        try {
          const createRes = await apiClient.post<ApiKeyResponse>(
            "/api/v1/user/update-api-key",
          );
          const created =
            typeof createRes.data === "string"
              ? createRes.data
              : createRes.data.apiKey;
          if (typeof created === "string") setApiKey(created);
        } catch (createErr: unknown) {
          setError(
            createErr instanceof Error
              ? createErr
              : new Error(String(createErr)),
          );
        }
      } else {
        setError(e instanceof Error ? e : new Error(String(e)));
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
      const res = await apiClient.post<ApiKeyResponse>(
        "/api/v1/user/update-api-key",
      );
      const value = typeof res.data === "string" ? res.data : res.data.apiKey;
      if (typeof value === "string") setApiKey(value);
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && session && !hasAttempted && !isAnonymous) {
      fetchKey();
    }
  }, [loading, session, hasAttempted, isAnonymous, fetchKey]);

  return {
    apiKey,
    isLoading,
    isRefreshing,
    error,
    refetch: fetchKey,
    refresh,
    hasAttempted,
  } as const;
}

export default useApiKey;
