import type { FileId } from "@app/types/fileContext";
import type { OperationSaveContext } from "@core/services/operationResultsSaveService";
import {
  downloadFile,
  downloadFromUrl,
  type DownloadResult,
} from "@app/services/downloadService";
import { enforceExportPolicies } from "@app/services/policyExport";
import { zipFileService } from "@app/services/zipFileService";
// Save through the export gateway so a "run on export" policy enforces before
// the file leaves the app (no-op when no such policy is active).
import { downloadFileWithPolicy } from "@app/services/exportWithPolicy";

export type { OperationSaveContext };

/**
 * Save what a tool produced.
 *
 * The desktop version loops over the outputs and saves each one. On a phone
 * every save is a document picker, so a split that produced thirty pages would
 * be thirty pickers in a row. Instead:
 *
 * - one output: save that file through the export-policy gateway, and mark the
 *   workspace copy saved so it stops showing as unsaved;
 * - several outputs: enforce export policies on each output, then save them as
 *   one zip. The zip the operation already built is not reused, because its
 *   entries never went through the policy gateway. Workspace copies are not
 *   marked saved: the zip is the saved artifact, not any individual file.
 */
export async function saveOperationResults(
  context: OperationSaveContext,
): Promise<DownloadResult | null> {
  if (!context.downloadUrl) return null;

  const outputFileIds = (context.outputFileIds ?? []) as FileId[];

  if (outputFileIds.length === 1) {
    const fileId = outputFileIds[0];
    const file = context.getFile(fileId);
    if (file) {
      const result = await downloadFileWithPolicy({
        data: file,
        filename: file.name,
        fileId,
      });
      if (result.savedPath) {
        context.markSaved(fileId, result.savedPath);
      }
      return result;
    }
  }

  const outputs = outputFileIds.flatMap((fileId) => {
    const file = context.getFile(fileId);
    return file ? [{ file, fileId }] : [];
  });

  if (outputs.length > 0) {
    const enforced = await enforceExportPolicies(
      outputs.map((output) => output.file),
      outputs.map((output) => output.fileId),
    );
    const zipFilename = context.downloadFilename || "download.zip";
    const { zipFile } = await zipFileService.createZipFromFiles(
      enforced,
      zipFilename,
    );
    return downloadFile({ data: zipFile, filename: zipFilename });
  }

  return downloadFromUrl(
    context.downloadUrl,
    context.downloadFilename || "download",
  );
}
