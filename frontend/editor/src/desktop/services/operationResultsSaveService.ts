import type { FileId } from "@app/types/fileContext";
import type { OperationSaveContext } from "@core/services/operationResultsSaveService";
import { downloadFromUrl, DownloadResult } from "@app/services/downloadService";
// Save through the export gateway so a "run on export" policy enforces before
// the file is written out (no-op when no such policy is active).
import { downloadFileWithPolicy as downloadFile } from "@app/services/exportWithPolicy";

export type { OperationSaveContext };

export async function saveOperationResults(
  context: OperationSaveContext,
): Promise<DownloadResult | null> {
  if (!context.downloadUrl) return null;

  if (context.outputFileIds && context.outputFileIds.length > 0) {
    for (const fileId of context.outputFileIds) {
      const file = context.getFile(fileId as FileId);
      const stub = context.getStub(fileId as FileId);
      if (!file) continue;

      const result = await downloadFile({
        data: file,
        filename: file.name,
        localPath: stub?.localFilePath,
      });

      if (result.savedPath) {
        context.markSaved(fileId as FileId, result.savedPath);
      }
    }
    return null;
  }

  const result = await downloadFromUrl(
    context.downloadUrl,
    context.downloadFilename || "download",
    context.downloadLocalPath || undefined,
  );

  if (context.outputFileIds && result.savedPath) {
    for (const fileId of context.outputFileIds) {
      context.markSaved(fileId as FileId, result.savedPath);
    }
  }

  return result;
}
