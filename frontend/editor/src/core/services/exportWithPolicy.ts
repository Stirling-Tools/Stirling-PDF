/**
 * Export entry points call {@link downloadFileWithPolicy} instead of
 * {@link downloadFile} so any "export"-triggered policy enforces on the file
 * before it's downloaded. The enforcement itself is proprietary (a no-op in the
 * core build via the `@app/services/policyExport` stub), and never hard-blocks:
 * on failure the original file is downloaded.
 */

import {
  downloadFile,
  type DownloadRequest,
  type DownloadResult,
} from "@app/services/downloadService";
import { enforceExportPolicies } from "@app/services/policyExport";

export async function downloadFileWithPolicy(
  request: DownloadRequest,
): Promise<DownloadResult> {
  // enforceExportPolicies only touches PDFs and is a no-op without an active
  // export policy, so non-PDF / non-policy downloads pass straight through.
  const input =
    request.data instanceof File
      ? request.data
      : new File([request.data], request.filename, {
          type: request.data.type,
        });
  const { files, blocked } = await enforceExportPolicies(
    [input],
    [request.fileId],
  );
  // A required policy failed: refuse the download (its toast is shown), reported as cancelled.
  if (blocked.length > 0) return { cancelled: true };
  const [enforced] = files;
  return downloadFile({ ...request, data: enforced ?? request.data });
}
