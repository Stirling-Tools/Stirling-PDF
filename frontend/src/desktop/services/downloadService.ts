import { saveToLocalPath, showSaveDialog } from "@app/services/localFileSaveService";

export interface DownloadRequest {
  data: Blob | File;
  filename: string;
  localPath?: string;
}

export async function downloadFile(request: DownloadRequest): Promise<void> {
  if (request.localPath) {
    const result = await saveToLocalPath(request.data, request.localPath);
    if (!result.success) {
      throw new Error(result.error || "Failed to save file");
    }
    return;
  }

  const savePath = await showSaveDialog(request.filename);
  if (!savePath) {
    return;
  }

  const result = await saveToLocalPath(request.data, savePath);
  if (!result.success) {
    throw new Error(result.error || "Failed to save file");
  }
}

export async function downloadFromUrl(
  url: string,
  filename: string,
  localPath?: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  await downloadFile({ data: blob, filename, localPath });
}
