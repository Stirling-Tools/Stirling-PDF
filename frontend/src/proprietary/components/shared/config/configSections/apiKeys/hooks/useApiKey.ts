import { useCallback, useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";
import { alert } from "@app/components/toast";
import { useTranslation } from "react-i18next";

export function useApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasAttempted, setHasAttempted] = useState<boolean>(false);
  const { t } = useTranslation();

  function failedToCreateAlert() {
    alert({
      alertType: "error",
      title: t("config.apiKeys.alert.apiKeyErrorTitle", "API Key Error"),
      body: t("config.apiKeys.alert.failedToCreateApiKey", "Failed to create API key."),
      isPersistentPopup: false,
    });
  }

  const fetchKey = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // Backend is POST for get and update
    await apiClient
      .post("/api/v1/user/get-api-key", undefined, {
        responseType: "json",
      })
      .then((response) => {
        const data = response.data;
        const apiKeyValue = typeof data === "string" ? data : data?.apiKey;
        if (typeof apiKeyValue === "string") {
          setApiKey(apiKeyValue);
        } else {
          alert({
            alertType: "error",
            title: t("config.apiKeys.alert.apiKeyErrorTitle", "API Key Error"),
            body: t("config.apiKeys.alert.failedToRetrieveApiKey", "Failed to retrieve API key from response."),
            isPersistentPopup: false,
          });
        }
      })
      .catch(async (e) => {
        // If not found, try to create one by calling update endpoint
        if (e?.response?.status === 404) {
          await apiClient
            .post("/api/v1/user/update-api-key")
            .then((createRes) => {
              const created = typeof createRes.data === "string" ? createRes.data : createRes.data?.apiKey;
              if (typeof created === "string") {
                setApiKey(created);
              } else {
                failedToCreateAlert();
              }
            })
            .catch((createErr) => {
              failedToCreateAlert();
              setError(createErr);
            });
        } else {
          alert({
            alertType: "error",
            title: t("config.apiKeys.alert.apiKeyErrorTitle", "API Key Error"),
            body: t("config.apiKeys.alert.failedToFetchApiKey", "Failed to fetch API key."),
            isPersistentPopup: false,
          });
          setError(e);
        }
      })
      .finally(() => {
        setIsLoading(false);
        setHasAttempted(true);
      });
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    await apiClient.post("/api/v1/user/update-api-key", undefined, {
      responseType: "json",
      suppressErrorToast: true,
    }).then((res) => {
      const value = typeof res.data === "string" ? res.data : res.data?.apiKey;
      if (typeof value === "string") {
        alert({
          alertType: "success",
          title: t("config.apiKeys.alert.apiKeyRefreshed", "API Key Refreshed"),
          body: t("config.apiKeys.alert.apiKeyRefreshedBody", "Your API key has been successfully refreshed."),
          isPersistentPopup: false,
        });
        setApiKey(value);
      } else {
        alert({
          alertType: "error",
          title: t("config.apiKeys.alert.apiKeyErrorTitle", "API Key Error"),
          body: t("config.apiKeys.alert.failedToRefreshApiKey", "Failed to refresh API key."),
          isPersistentPopup: false,
        });
      }
    }).catch((e) => {
      alert({
        alertType: "error",
        title: t("config.apiKeys.alert.apiKeyErrorTitle", "API Key Error"),
        body: t("config.apiKeys.alert.failedToRefreshApiKey", "Failed to refresh API key."),
          isPersistentPopup: false,
      });
      setError(e);
    }).finally(() => {
      setIsRefreshing(false);
    });
  }, []);

  useEffect(() => {
    if (!hasAttempted) {
      fetchKey();
    }
  }, [hasAttempted, fetchKey]);

  return { apiKey, isLoading, isRefreshing, error, refetch: fetchKey, refresh, hasAttempted } as const;
}

export default useApiKey;
