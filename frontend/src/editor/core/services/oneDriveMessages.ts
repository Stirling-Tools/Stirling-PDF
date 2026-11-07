import type { TFunction } from "i18next";
import type {
  OneDriveFailure,
  OneDrivePickOptions,
} from "@editor/services/oneDrivePickerService";

export function oneDriveFailureMessage(
  t: TFunction,
  failure: OneDriveFailure | "failed" | null,
): string {
  switch (failure) {
    case "popupBlocked":
      return t(
        "provider.onedrive.errors.popupBlocked",
        "Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site and try again.",
      );
    case "reconnect":
      return t(
        "provider.onedrive.errors.reconnect",
        "Your Microsoft account needs to sign in again. Reconnect it in Settings > Connected accounts.",
      );
    case "network":
      return t(
        "provider.onedrive.errors.unreachable",
        "Couldn't reach OneDrive. Check your connection and try again.",
      );
    default:
      return t(
        "provider.onedrive.errors.serverError",
        "OneDrive or the Stirling server had a problem. Try again, or ask your administrator if it keeps happening.",
      );
  }
}

export function oneDrivePickerLabels(
  t: TFunction,
  title: string,
): NonNullable<OneDrivePickOptions["labels"]> {
  return {
    title,
    close: t("close", "Close"),
    loading: t("provider.onedrive.pickerLoading", "Connecting to OneDrive…"),
  };
}

export function oneDriveConnectFailedMessage(t: TFunction): string {
  return t(
    "provider.onedrive.errors.connectFailed",
    "Couldn't connect your Microsoft account. Try again from Settings > Connected accounts.",
  );
}
