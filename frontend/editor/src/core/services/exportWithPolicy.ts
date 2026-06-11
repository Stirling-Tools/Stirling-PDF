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
  // Only PDFs go through policy enforcement; zips, JSON reports, configs etc.
  // download as-is (enforceExportPolicies is also a no-op when no export policy
  // is active, so this just avoids handing non-PDF bytes to the policy engine).
  const isPdf =
    request.data.type === "application/pdf" || /\.pdf$/i.test(request.filename);
  if (!isPdf) return downloadFile(request);

  const input =
    request.data instanceof File
      ? request.data
      : new File([request.data], request.filename, {
          type: request.data.type,
        });
  const [enforced] = await enforceExportPolicies([input]);
  return downloadFile({ ...request, data: enforced ?? request.data });
}
