import type { DownloadRequest, DownloadResult } from "@core/services/downloadService";
import { saveToLocalPath, showSaveDialog } from "@app/services/localFileSaveService";

export type { DownloadRequest, DownloadResult };

export async function downloadFile(request: DownloadRequest): Promise<DownloadResult> {
  if (request.localPath) {
    const outputExt = request.filename.split('.').pop()?.toLowerCase();
    const savedExt = request.localPath.split('.').pop()?.toLowerCase();
    // Only overwrite in-place when the extension matches. A differing extension
    // (e.g. ZIP output → original .pdf path) means the format changed, so fall
    // through to the Save As dialog instead of silently corrupting the file.
    if (outputExt === savedExt) {
      const result = await saveToLocalPath(request.data, request.localPath);
      if (!result.success) {
        throw new Error(result.error || "Failed to save file");
      }
      return { savedPath: request.localPath };
    }
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
