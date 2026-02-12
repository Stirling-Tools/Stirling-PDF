export interface DownloadRequest {
  data: Blob | File;
  filename: string;
  localPath?: string;
}

export interface DownloadResult {
  savedPath?: string;
  cancelled?: boolean;
}

export async function downloadFile(request: DownloadRequest): Promise<DownloadResult> {
  const url = URL.createObjectURL(request.data);

  const link = document.createElement("a");
  link.href = url;
  link.download = request.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  return { savedPath: request.localPath };
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
