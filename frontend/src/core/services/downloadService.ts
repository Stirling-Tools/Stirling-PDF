export interface DownloadRequest {
  data: Blob | File;
  filename: string;
  localPath?: string;
}

export async function downloadFile(request: DownloadRequest): Promise<void> {
  const url = URL.createObjectURL(request.data);

  const link = document.createElement("a");
  link.href = url;
  link.download = request.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
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
