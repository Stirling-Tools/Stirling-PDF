import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/ui/Icon";
import { useGoogleDrivePicker } from "@editor/hooks/useGoogleDrivePicker";
import { useOneDrivePicker } from "@editor/hooks/useOneDrivePicker";

export interface CloudPickOptions {
  multiple?: boolean;
  accept?: string;
}

export interface CloudFilePicker {
  id: "googledrive" | "onedrive";
  icon: IconName;
  name: string;
  actionLabel: string;
  failedTitle: string;
  testId: string;
  isLoading: boolean;
  error: string | null;
  reconnectNeeded: boolean;
  clearError: () => void;
  openPicker: (options?: CloudPickOptions) => Promise<File[]>;
}

export function useCloudFilePickers(): CloudFilePicker[] {
  const { t } = useTranslation();
  const google = useGoogleDrivePicker();
  const oneDrive = useOneDrivePicker();

  return useMemo(() => {
    const pickers: CloudFilePicker[] = [];
    if (google.isEnabled) {
      pickers.push({
        id: "googledrive",
        icon: "googledrive",
        name: "Google Drive",
        actionLabel: t("fileSidebar.googleDrive", "Open from Google Drive"),
        failedTitle: t(
          "provider.googledrive.errors.pickerFailed",
          "Failed to open Google Drive picker",
        ),
        testId: "google-drive-button",
        isLoading: google.isLoading,
        error: google.error,
        reconnectNeeded: false,
        clearError: google.clearError,
        openPicker: (options = {}) =>
          google.openPicker({
            multiple: options.multiple,
            mimeTypes: options.accept,
          }),
      });
    }
    if (oneDrive.isEnabled) {
      pickers.push({
        id: "onedrive",
        icon: "onedrive",
        name: "OneDrive",
        actionLabel: t("fileSidebar.oneDrive", "Open from OneDrive"),
        failedTitle: t("fileSidebar.oneDriveFailed", "Couldn't open OneDrive"),
        testId: "onedrive-button",
        isLoading: oneDrive.isLoading,
        error: oneDrive.error,
        reconnectNeeded: oneDrive.reconnectNeeded,
        clearError: oneDrive.clearError,
        openPicker: oneDrive.openPicker,
      });
    }
    return pickers;
  }, [google, oneDrive, t]);
}
