import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { IconName } from "@app/ui/Icon";
import { useGoogleDrivePicker } from "@app/hooks/useGoogleDrivePicker";
import { useOneDrivePicker } from "@app/hooks/useOneDrivePicker";

export interface CloudPickOptions {
  multiple?: boolean;
  /** An `<input accept>` string narrowing what the picker offers. */
  accept?: string;
}

/** One cloud storage service the user can open files from. */
export interface CloudFilePicker {
  id: "googledrive" | "onedrive";
  icon: IconName;
  /** The service's own name, e.g. "OneDrive", for a button that says where. */
  name: string;
  /** A full action label, e.g. "Open from OneDrive", for an icon-only control. */
  actionLabel: string;
  /** Shown when the pick fails. */
  failedTitle: string;
  testId: string;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  openPicker: (options?: CloudPickOptions) => Promise<File[]>;
}

/**
 * The cloud file pickers this server has enabled, in display order. Every
 * "open from the cloud" surface renders this list, so adding a service means
 * adding one entry here rather than threading new props through each surface.
 */
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
        clearError: oneDrive.clearError,
        openPicker: oneDrive.openPicker,
      });
    }
    return pickers;
  }, [google, oneDrive, t]);
}
