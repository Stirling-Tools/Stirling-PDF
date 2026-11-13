import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import {
  ensureConnectedAccount,
  useConnectedAccounts,
} from "@editor/hooks/useConnectedAccounts";
import {
  acceptToExtensions,
  classifyOneDriveFailure,
  getOneDriveConfig,
  getOneDrivePickerService,
  isUserCancelled,
} from "@editor/services/oneDrivePickerService";
import {
  oneDriveConnectFailedMessage,
  oneDriveFailureMessage,
  oneDrivePickerLabels,
} from "@editor/services/oneDriveMessages";

interface UseOneDrivePickerOptions {
  multiple?: boolean;
  accept?: string;
}

interface UseOneDrivePickerReturn {
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  reconnectNeeded: boolean;
  clearError: () => void;
  openPicker: (options?: UseOneDrivePickerOptions) => Promise<File[]>;
}

export function useOneDrivePicker(): UseOneDrivePickerReturn {
  const { t, i18n } = useTranslation();
  const { config } = useAppConfig();
  const connected = useConnectedAccounts();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const clearError = useCallback(() => {
    setError(null);
    setReconnectNeeded(false);
  }, []);

  const oneDriveConfig = useMemo(
    () => getOneDriveConfig(config),
    [
      config?.microsoftEnabled,
      config?.microsoftClientId,
      config?.microsoftTenant,
      config?.microsoftGraphUrl,
    ],
  );
  const isEnabled = oneDriveConfig !== null;
  const useAccounts = connected.available("microsoft");

  useEffect(() => {
    if (oneDriveConfig) {
      getOneDrivePickerService()
        .initialize(oneDriveConfig)
        .catch((err: unknown) => console.error("OneDrive init failed:", err));
    }
  }, [oneDriveConfig]);

  const openPicker = useCallback(
    async (options: UseOneDrivePickerOptions = {}): Promise<File[]> => {
      if (!oneDriveConfig) {
        setError(
          t(
            "provider.onedrive.errors.notConfigured",
            "OneDrive is not configured",
          ),
        );
        return [];
      }
      try {
        setIsLoading(true);
        setError(null);
        setReconnectNeeded(false);
        let account;
        if (useAccounts) {
          const connection = await ensureConnectedAccount(
            "microsoft",
            connected.connect,
          );
          if (!connection.account) {
            if (connection.outcome === "error") {
              setError(oneDriveConnectFailedMessage(t));
            }
            return [];
          }
          account = connection.account;
        }
        const service = getOneDrivePickerService();
        await service.initialize(oneDriveConfig);
        return await service.pick(
          {
            multiple: options.multiple ?? true,
            extensions: acceptToExtensions(options.accept),
            locale: i18n?.language,
            labels: oneDrivePickerLabels(
              t,
              t("provider.onedrive.pickerTitle", "Choose files from OneDrive"),
            ),
          },
          account && !account.personal ? { accountId: account.id } : undefined,
        );
      } catch (err) {
        if (isUserCancelled(err)) return [];
        console.error("OneDrive picker error:", err);
        const failure = classifyOneDriveFailure(err);
        setReconnectNeeded(failure === "reconnect");
        if (failure) {
          setError(oneDriveFailureMessage(t, failure));
        } else {
          setError(
            err instanceof Error
              ? err.message
              : t(
                  "provider.onedrive.errors.pickerFailed",
                  "Failed to open OneDrive",
                ),
          );
        }
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [oneDriveConfig, useAccounts, connected.connect, i18n?.language, t],
  );

  return useMemo(
    () => ({
      isEnabled,
      isLoading,
      error,
      reconnectNeeded,
      clearError,
      openPicker,
    }),
    [isEnabled, isLoading, error, reconnectNeeded, clearError, openPicker],
  );
}
