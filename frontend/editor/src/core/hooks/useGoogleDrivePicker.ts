import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import {
  ensureConnectedAccount,
  useConnectedAccounts,
} from "@app/hooks/useConnectedAccounts";
import { fetchAccessToken } from "@app/services/connectedAccountsService";
import {
  getGoogleDrivePickerService,
  isGoogleDriveConfigured,
  getGoogleDriveConfig,
  extractGoogleDriveBackendConfig,
} from "@app/services/googleDrivePickerService";

interface UseGoogleDrivePickerOptions {
  multiple?: boolean;
  mimeTypes?: string;
}

interface UseGoogleDrivePickerReturn {
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  openPicker: (options?: UseGoogleDrivePickerOptions) => Promise<File[]>;
}

/**
 * Initializes Drive lazily; failed picks resolve to [] and set error until
 * cleared or retried. Where the server offers connected accounts, the picker
 * runs on the user's connected Google account (connected on first use), so the
 * same sign-in serves their pipelines.
 */
export function useGoogleDrivePicker(): UseGoogleDrivePickerReturn {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const [isInitialized, setIsInitialized] = useState(false);
  const connected = useConnectedAccounts();
  const useAccounts = connected.available("google");

  // Unrelated app settings must not invalidate Drive's config or picker callbacks.
  const googleDriveBackendConfig = useMemo(
    () => extractGoogleDriveBackendConfig(config),
    [
      config?.googleDriveEnabled,
      config?.googleDriveClientId,
      config?.googleDriveApiKey,
      config?.googleDriveAppId,
    ],
  );

  useEffect(() => {
    const configured = isGoogleDriveConfigured(googleDriveBackendConfig);
    setIsEnabled(configured);
    if (!configured) {
      setIsInitialized(false);
    }
  }, [googleDriveBackendConfig]);

  const initializeService = useCallback(async () => {
    if (isInitialized) return;

    const googleDriveConfig = getGoogleDriveConfig(googleDriveBackendConfig);
    if (!googleDriveConfig) {
      throw new Error(
        t(
          "provider.googledrive.errors.notConfigured",
          "Google Drive is not configured",
        ),
      );
    }

    const service = getGoogleDrivePickerService();
    await service.initialize(googleDriveConfig);
    setIsInitialized(true);
  }, [isInitialized, googleDriveBackendConfig, t]);

  const openPicker = useCallback(
    async (options: UseGoogleDrivePickerOptions = {}): Promise<File[]> => {
      if (!isEnabled) {
        setError(
          t(
            "provider.googledrive.errors.notConfigured",
            "Google Drive is not configured",
          ),
        );
        return [];
      }

      try {
        setIsLoading(true);
        setError(null);

        let account;
        if (useAccounts) {
          const connection = await ensureConnectedAccount(
            "google",
            connected.connect,
          );
          if (!connection.account) {
            if (connection.outcome === "error") {
              setError(
                t(
                  "provider.googledrive.errors.connectFailed",
                  "Couldn't connect your Google account. Try again from Settings > Connected accounts.",
                ),
              );
            }
            return [];
          }
          account = connection.account;
        }

        await initializeService();

        const service = getGoogleDrivePickerService();
        const pickerOptions = {
          multiple: options.multiple ?? true,
          mimeTypes: options.mimeTypes,
        };
        if (account) {
          const token = await fetchAccessToken(account.id, "drive");
          return await service.openPickerWithToken(token, pickerOptions);
        }
        return await service.openPicker(pickerOptions);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : t(
                "provider.googledrive.errors.pickerFailed",
                "Failed to open Google Drive picker",
              );
        setError(errorMessage);
        console.error("Google Drive picker error:", err);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [isEnabled, initializeService, useAccounts, connected, t],
  );

  return {
    isEnabled,
    isLoading,
    error,
    clearError,
    openPicker,
  };
}
