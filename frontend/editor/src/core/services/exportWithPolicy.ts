/**
 * Export entry points call {@link downloadFileWithPolicy} instead of
 * {@link downloadFile} so any "export"-triggered policy enforces on the file
 * before it's downloaded. The enforcement itself is proprietary (a no-op in the
 * core build via the `@app/services/policyExport` stub), and never hard-blocks:
 * on failure the original file is downloaded.
 *
 * The review gate is enforced here too, but only for callers that pass a
 * `fileId`: without one there is nothing to look up, so the download proceeds
 * ungated. Any caller that has a file id must pass it.
 */

import {
  downloadFile,
  type DownloadRequest,
  type DownloadResult,
} from "@app/services/downloadService";
import { enforceExportPolicies } from "@app/services/policyExport";
import { requestReviewClearance } from "@app/services/reviewGate";

export interface PolicyDownloadRequest extends DownloadRequest {
  /**
   * Set when the caller already cleared the gate for this export, e.g. a batch
   * that prompted once for all its files. Skips the per-file prompt.
   */
  reviewCleared?: boolean;
}

export async function downloadFileWithPolicy(
  request: PolicyDownloadRequest,
): Promise<DownloadResult> {
  if (!request.reviewCleared) {
    const cleared = await requestReviewClearance(
      request.fileId ? [request.fileId] : [],
      "download",
    );
    if (!cleared) return { cancelled: true };
  }
  // enforceExportPolicies only touches PDFs and is a no-op without an active
  // export policy, so non-PDF / non-policy downloads pass straight through.
  const input =
    request.data instanceof File
      ? request.data
      : new File([request.data], request.filename, {
          type: request.data.type,
        });
  const [enforced] = await enforceExportPolicies([input], [request.fileId]);
  return downloadFile({ ...request, data: enforced ?? request.data });
}
