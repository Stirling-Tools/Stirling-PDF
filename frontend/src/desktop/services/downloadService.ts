import type { DownloadRequest, DownloadResult } from "@core/services/downloadService";
import { saveToLocalPath, showSaveDialog } from "@app/services/localFileSaveService";

export type { DownloadRequest, DownloadResult };

export async function downloadFile(request: DownloadRequest): Promise<DownloadResult> {
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
  localPath?: string
): Promise<DownloadResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  return downloadFile({ data: blob, filename, localPath });
}
