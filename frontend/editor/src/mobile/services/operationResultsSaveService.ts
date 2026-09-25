import type { FileId } from "@app/types/fileContext";
import type { OperationSaveContext } from "@core/services/operationResultsSaveService";
import {
  downloadFromUrl,
  type DownloadResult,
} from "@app/services/downloadService";
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
 * - several outputs: save the single zip the operation already built, which is
 *   what `downloadUrl` points at once there is more than one result.
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

  const result = await downloadFromUrl(
    context.downloadUrl,
    context.downloadFilename || "download",
  );

  if (result.savedPath) {
    for (const fileId of outputFileIds) {
      context.markSaved(fileId, result.savedPath);
    }
  }

  return result;
}
