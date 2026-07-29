/**
 * How a download actually reaches the disk, per platform. The browser build
 * clicks an anchor; the desktop build shadows this module to write through
 * Tauri (native save dialog / direct path write).
 *
 * Nothing calls these directly except {@link "@app/services/downloadService"},
 * which is the gated front door — go through that instead, so the review gate
 * and export-policy enforcement can't be bypassed.
 */

export interface DownloadRequest {
  data: Blob | File;
  filename: string;
  localPath?: string;
  /** Workspace fileId of the file being exported, when known. Lets export-time
   *  policy enforcement version the in-editor file (not just the download),
   *  and tells the review gate which document is leaving. */
  fileId?: string;
  /** How the review gate should name this action; defaults to "download". */
  verb?: "download" | "save" | "print" | "share";
}

export interface DownloadResult {
  savedPath?: string;
  cancelled?: boolean;
}

export async function writeFile(
  request: DownloadRequest,
): Promise<DownloadResult> {
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

export async function writeFromUrl(
  url: string,
  filename: string,
  localPath?: string,
): Promise<DownloadResult> {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return { savedPath: localPath };
}
