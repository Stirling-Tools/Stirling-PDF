/**
 * Export entry points call {@link downloadFileWithPolicy} instead of
 * {@link downloadFile} so any "export"-triggered policy enforces on the file
 * before it's downloaded. The enforcement itself is proprietary (a no-op in the
 * core build via the `@app/services/policyExport` stub). Required-policy failures
 * cancel the export; ordinary pipeline failures may download the original.
 */

import {
  downloadFile,
  type DownloadRequest,
  type DownloadResult,
} from "@app/services/downloadService";
import { enforceExportPolicies } from "@app/services/policyExport";
import { includeMeasurementsInExport } from "../../features/measurement/utils/measurementExportBridge";

export async function downloadFileWithPolicy(
  request: DownloadRequest,
): Promise<DownloadResult> {
  // enforceExportPolicies only touches PDFs and is a no-op without an active
  // export policy, so non-PDF / non-policy downloads pass straight through.
  const withMeasurements = await includeMeasurementsInExport(request.data, request.filename, request.fileId);
  const input =
    withMeasurements instanceof File
      ? withMeasurements
      : new File([withMeasurements], request.filename, {
          type: withMeasurements.type,
        });
  const [enforced] = await enforceExportPolicies([input], [request.fileId]);
  return downloadFile({ ...request, data: enforced ?? withMeasurements });
}
