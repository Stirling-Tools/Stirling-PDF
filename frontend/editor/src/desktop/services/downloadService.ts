import type {
  DownloadRequest,
  DownloadResult,
} from "@core/services/downloadService";
import {
  saveToLocalPath,
  showSaveDialog,
} from "@app/services/localFileSaveService";
import {
  requestReviewClearance,
  type ClearanceTarget,
  type ExportVerb,
} from "@app/services/reviewGate";

export type { DownloadRequest, DownloadResult };

// Same review-gate rule as the core implementation this shadows: nothing is
// written until a flagged document has been cleared by the reviewer.
export async function downloadFile(
  request: DownloadRequest,
): Promise<DownloadResult> {
  if (
    !(await requestReviewClearance(request.fileId, request.verb ?? "download"))
  ) {
    return { cancelled: true };
  }
  if (request.localPath) {
    const result = await saveToLocalPath(request.data, request.localPath);
    if (!result.success) {
      throw new Error(result.error || "Failed to save file");
    }
    return { savedPath: request.localPath };
  }

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

export async function downloadFromUrl(
  url: string,
  filename: string,
  localPath?: string,
  fileIds?: ClearanceTarget,
  verb: ExportVerb = "download",
): Promise<DownloadResult> {
  if (!(await requestReviewClearance(fileIds, verb))) {
    return { cancelled: true };
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  return downloadFile({ data: blob, filename, localPath });
}
