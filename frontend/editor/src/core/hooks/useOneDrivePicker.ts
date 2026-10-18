import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import {
  ensureConnectedAccount,
  useConnectedAccounts,
} from "@app/hooks/useConnectedAccounts";
import { isPopupBlocked } from "@app/services/connectedAccountsService";
import {
  acceptToExtensions,
  getOneDriveConfig,
  getOneDrivePickerService,
} from "@app/services/oneDrivePickerService";

interface UseOneDrivePickerOptions {
  multiple?: boolean;
  /** An `<input accept>` string; only its extensions narrow the picker. */
  accept?: string;
}

interface UseOneDrivePickerReturn {
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  openPicker: (options?: UseOneDrivePickerOptions) => Promise<File[]>;
}

/**
 * The OneDrive/SharePoint picker, when the server enables it. Where the server
 * offers connected accounts, the first use connects the user's Microsoft
 * account (one sign-in shared with their pipelines) and later picks need no
 * sign-in at all. Personal accounts, and servers without connections, sign in
 * in this browser instead; that code is fetched as soon as the picker is
 * enabled, so its pop-up still opens inside the click's user activation. A
 * failed pick resolves to [] and sets error until cleared or retried.
 */
export function useOneDrivePicker(): UseOneDrivePickerReturn {
  const { t, i18n } = useTranslation();
  const { config } = useAppConfig();
  const connected = useConnectedAccounts();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

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
        if (isPopupBlocked(err)) {
          setError(
            t(
              "provider.onedrive.errors.popupBlocked",
              "Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site and try again.",
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

  return { isEnabled, isLoading, error, clearError, openPicker };
}
