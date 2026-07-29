/**
 * Export entry points call {@link downloadFileWithPolicy} instead of
 * {@link downloadFile} so any "export"-triggered policy enforces on the file
 * before it's downloaded. The enforcement itself is proprietary (a no-op in the
 * core build via the `@app/services/policyExport` stub), and never hard-blocks:
 * on failure the original file is downloaded.
 *
 * The download service this delegates to owns the review gate, but it can only
 * ask once the bytes are ready — and enforcement rewrites those bytes and
 * versions the in-editor file, which shouldn't happen for an export the
 * reviewer then cancels. So the gate is pulled forward around the whole thing;
 * the clearance carries into the inner download rather than prompting twice.
 */

import {
  downloadFile,
  type DownloadRequest,
  type DownloadResult,
} from "@app/services/downloadService";
import { enforceExportPolicies } from "@app/services/policyExport";
import { withReviewClearance } from "@app/services/reviewGate";

export async function downloadFileWithPolicy(
  request: DownloadRequest,
): Promise<DownloadResult> {
  const result = await withReviewClearance(
    request.fileId,
    request.verb ?? "download",
    async () => {
      // enforceExportPolicies only touches PDFs and is a no-op without an
      // active export policy, so non-PDF / non-policy downloads pass through.
      const input =
        request.data instanceof File
          ? request.data
          : new File([request.data], request.filename, {
              type: request.data.type,
            });
      const [enforced] = await enforceExportPolicies([input], [request.fileId]);
      return downloadFile({ ...request, data: enforced ?? request.data });
    },
  );
  return result ?? { cancelled: true };
}
