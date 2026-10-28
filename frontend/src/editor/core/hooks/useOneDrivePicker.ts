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
} from "@editor/services/oneDrivePickerService";

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
              setError(
                t(
                  "provider.onedrive.errors.connectFailed",
                  "Couldn't connect your Microsoft account. Try again from Settings > Connected accounts.",
                ),
              );
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
            labels: {
              title: t(
                "provider.onedrive.pickerTitle",
                "Choose files from OneDrive",
              ),
              close: t("close", "Close"),
              loading: t(
                "provider.onedrive.pickerLoading",
                "Connecting to OneDrive…",
              ),
            },
          },
          account && !account.personal ? { accountId: account.id } : undefined,
        );
      } catch (err) {
        if (
          (err as { errorCode?: string } | null)?.errorCode === "user_cancelled"
        ) {
          return [];
        }
        console.error("OneDrive picker error:", err);
        const failure = classifyOneDriveFailure(err);
        setReconnectNeeded(failure === "reconnect");
        if (failure === "popupBlocked") {
          setError(
            t(
              "provider.onedrive.errors.popupBlocked",
              "Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site and try again.",
            ),
          );
        } else if (failure === "reconnect") {
          setError(
            t(
              "provider.onedrive.errors.reconnect",
              "Your Microsoft account needs to sign in again. Reconnect it in Settings > Connected accounts.",
            ),
          );
        } else if (failure === "network") {
          setError(
            t(
              "provider.onedrive.errors.unreachable",
              "Couldn't reach OneDrive. Check your connection and try again.",
            ),
          );
        } else if (failure === "server") {
          setError(
            t(
              "provider.onedrive.errors.serverError",
              "OneDrive or the Stirling server had a problem. Try again, or ask your administrator if it keeps happening.",
            ),
          );
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
    [oneDriveConfig, useAccounts, connected, i18n?.language, t],
  );

  return {
    isEnabled,
    isLoading,
    error,
    reconnectNeeded,
    clearError,
    openPicker,
  };
}
