import {
  requestReviewClearance,
  type ClearanceTarget,
  type ExportVerb,
} from "@app/services/reviewGate";

export interface DownloadRequest {
  data: Blob | File;
  filename: string;
  localPath?: string;
  /** Workspace fileId of the file being exported, when known. Lets export-time
   *  policy enforcement version the in-editor file (not just the download),
   *  and tells the review gate which document is leaving. */
  fileId?: string;
  /** How the review gate names this action in its prompt; default "download". */
  verb?: ExportVerb;
}

export interface DownloadResult {
  savedPath?: string;
  cancelled?: boolean;
}

/**
 * Both functions here check the review gate before writing anything, so a
 * document flagged "needs review" cannot leave the app without the reviewer
 * answering the prompt — call sites don't add their own gate. Document exports
 * should still go through `downloadFileWithPolicy`, which additionally applies
 * export-triggered policies to the bytes.
 */
export async function downloadFile(
  request: DownloadRequest,
): Promise<DownloadResult> {
  if (
    !(await requestReviewClearance(request.fileId, request.verb ?? "download"))
  ) {
    return { cancelled: true };
  }
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

/**
 * @param fileIds Workspace file id(s) the served bytes derive from — what the
 *   review gate checks. Pass them whenever the download is document-derived;
 *   omit only for generated artifacts (extracted text, JSON reports).
 */
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
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return { savedPath: localPath };
}
