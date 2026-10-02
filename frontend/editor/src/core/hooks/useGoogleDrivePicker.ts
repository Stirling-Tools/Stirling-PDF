import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
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

/** Initializes Drive lazily; failed picks resolve to [] and set error until cleared or retried. */
export function useGoogleDrivePicker(): UseGoogleDrivePickerReturn {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);
  const [isInitialized, setIsInitialized] = useState(false);

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

        await initializeService();

        const service = getGoogleDrivePickerService();
        const files = await service.openPicker({
          multiple: options.multiple ?? true,
          mimeTypes: options.mimeTypes,
        });

        return files;
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
    [isEnabled, initializeService, t],
  );

  return {
    isEnabled,
    isLoading,
    error,
    clearError,
    openPicker,
  };
}
