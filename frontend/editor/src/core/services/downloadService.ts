/**
 * The one way a file leaves the app to disk. Both entry points enforce the
 * review gate before writing anything, so a caller cannot forget it — a
 * document flagged as needing review can't be downloaded without the reviewer
 * answering the prompt first.
 *
 * The platform-specific writing lives in `@app/services/downloadWriter`
 * (anchor click in the browser, native save dialog on desktop); this module is
 * shared, so the gate exists once rather than once per platform.
 *
 * Callers that also want export-triggered policies applied to the bytes use
 * `downloadFileWithPolicy` from `@app/services/exportWithPolicy`, which wraps
 * {@link downloadFile}.
 */

import {
  writeFile,
  writeFromUrl,
  type DownloadRequest,
  type DownloadResult,
} from "@app/services/downloadWriter";
import {
  requestReviewClearance,
  type ClearanceTarget,
  type ExportVerb,
} from "@app/services/reviewGate";

export type { DownloadRequest, DownloadResult };

export interface UrlDownloadRequest {
  url: string;
  filename: string;
  localPath?: string;
  /**
   * Workspace file id(s) this download derives from — the subject of the review
   * gate. Required, and explicitly `null` when no workspace file is behind it
   * (extracted text, a generated report), so a new call site has to think about
   * it rather than silently downloading past the gate.
   */
  fileIds: ClearanceTarget;
  /** How the gate should name this action; "download" unless told otherwise. */
  verb?: ExportVerb;
}

export async function downloadFile(
  request: DownloadRequest,
): Promise<DownloadResult> {
  if (
    !(await requestReviewClearance(request.fileId, request.verb ?? "download"))
  ) {
    return { cancelled: true };
  }
  return writeFile(request);
}

/** Download whatever a URL serves — usually a blob URL from a tool result. */
export async function downloadFromUrl(
  request: UrlDownloadRequest,
): Promise<DownloadResult> {
  if (
    !(await requestReviewClearance(request.fileIds, request.verb ?? "download"))
  ) {
    return { cancelled: true };
  }
  return writeFromUrl(request.url, request.filename, request.localPath);
}
