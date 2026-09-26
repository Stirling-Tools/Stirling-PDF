import type {
  DownloadRequest,
  DownloadResult,
} from "@core/services/downloadService";
import {
  saveToLocalPath,
  showSaveDialog,
} from "@app/services/localFileSaveService";

export type { DownloadRequest, DownloadResult };

/**
 * Write a file out of the app and onto the device.
 *
 * Unlike desktop, `request.localPath` is deliberately ignored. A path recorded
 * on a phone is never a durable filesystem path we may write to again: Android
 * gives back a `content://` URI whose permission grant does not survive a
 * restart, and iOS gives back a security-scoped URL that is only valid while
 * access is held. Silently overwriting the original also contradicts what the
 * document picker promises, which is a copy. So saving always asks.
 */
export async function downloadFile(
  request: DownloadRequest,
): Promise<DownloadResult> {
  const savePath = await showSaveDialog(request.filename);
  if (!savePath) {
    return { cancelled: true };
  }

  const result = await saveToLocalPath(request.data, savePath);
  if (!result.success) {
    throw new Error(result.error || "Failed to save file");
  }

  return { savedPath: savePath };
}

/**
 * Fetch `url` and hand the bytes to the save picker. `localPath` is accepted for
 * signature parity with desktop and ignored: a phone app cannot write back to a
 * path it was not just granted by the picker.
 */
export async function downloadFromUrl(
  url: string,
  filename: string,
  _localPath?: string,
): Promise<DownloadResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  return downloadFile({ data: blob, filename });
}

/** Outcome of {@link shareFiles}. `unavailable` means no share sheet exists. */
export type ShareStatus = "shared" | "cancelled" | "unavailable" | "failed";

export interface ShareResult {
  status: ShareStatus;
  error?: string;
}

type ShareCapableNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

/**
 * Whether the OS share sheet can take these files.
 *
 * This is a capability probe, not a platform check: the app is handed a share
 * sheet by the web view or it is not, and the two mobile web views disagree.
 * WebKit implements the Web Share API, so iOS gets a real share sheet; the
 * Android System WebView does not expose `navigator.share`, so the caller hides
 * the action there. Sharing arbitrary files through a native Tauri command
 * would remove the difference, but that needs Swift and Kotlin we have not
 * written (see the notes on this workstream).
 */
export function canShareFiles(files: File[]): boolean {
  if (files.length === 0) return false;
  const nav = navigator as ShareCapableNavigator;
  if (typeof nav.share !== "function") return false;
  if (typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files });
  } catch {
    return false;
  }
}

/**
 * Hand files to the OS share sheet.
 *
 * Must be called straight out of a tap handler: the share sheet needs the
 * transient user activation from that gesture, and awaiting anything first
 * spends it.
 */
export async function shareFiles(
  files: File[],
  title?: string,
): Promise<ShareResult> {
  if (!canShareFiles(files)) {
    return { status: "unavailable" };
  }

  try {
    await navigator.share({ files, title });
    return { status: "shared" };
  } catch (error) {
    // Dismissing the sheet rejects with AbortError, which is not a failure.
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "cancelled" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", error: message };
  }
}
