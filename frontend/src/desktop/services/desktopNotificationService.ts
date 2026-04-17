import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import i18n from "@app/i18n";

const APP_TITLE = "Stirling-PDF";

async function shouldShowBackgroundNotification(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  try {
    const window = getCurrentWindow();
    const [isMinimized, isFocused] = await Promise.all([
      window.isMinimized().catch(() => false),
      window.isFocused().catch(() => true),
    ]);

    return isMinimized || !isFocused || document.visibilityState !== "visible";
  } catch {
    return false;
  }
}

export async function notifyPdfProcessingComplete(
  fileCount: number,
): Promise<void> {
  console.log(
    "[DesktopNotification] notifyPdfProcessingComplete called with fileCount:",
    fileCount,
  );

  if (!isTauri() || fileCount <= 0) {
    console.log("[DesktopNotification] Skipped: !isTauri() or fileCount <= 0");
    return;
  }

  const canNotify = await shouldShowBackgroundNotification();
  console.log("[DesktopNotification] canNotify (background):", canNotify);
  if (!canNotify) {
    console.log("[DesktopNotification] App is in focus, skipping notification");
    return;
  }

  try {
    // Check and request permission if needed
    let permissionGranted = await isPermissionGranted();
    console.log("[DesktopNotification] Permission check:", permissionGranted);

    if (!permissionGranted) {
      console.log("[DesktopNotification] Requesting permission...");
      const permission = await requestPermission();
      permissionGranted = permission === "granted";
      console.log("[DesktopNotification] Permission result:", permission);
    }

    if (!permissionGranted) {
      console.log(
        "[DesktopNotification] Permission not granted, skipping notification",
      );
      return;
    }

    const body =
      fileCount === 1
        ? i18n.t("processingComplete", "Your file is ready.")
        : i18n.t("processingCompleteMultiple", "{{count}} files are ready.", {
            count: fileCount,
          });
    console.log("[DesktopNotification] Sending notification:", body);
    await sendNotification({
      title: APP_TITLE,
      body,
    });
    console.log("[DesktopNotification] Notification sent successfully");
  } catch (error) {
    console.warn("[DesktopNotification] Unable to send notification", error);
  }
}
