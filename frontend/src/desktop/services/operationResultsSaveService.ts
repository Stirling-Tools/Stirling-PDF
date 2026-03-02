import type { FileId } from '@app/types/fileContext';
import type { OperationSaveContext } from '@core/services/operationResultsSaveService';
import { downloadFile, downloadFromUrl, DownloadResult } from '@app/services/downloadService';

export type { OperationSaveContext };

export async function saveOperationResults(context: OperationSaveContext): Promise<DownloadResult | null> {
  if (!context.downloadUrl) return null;

  if (context.outputFileIds && context.outputFileIds.length > 0) {
    for (const fileId of context.outputFileIds) {
      const file = context.getFile(fileId as FileId);
      const stub = context.getStub(fileId as FileId);
      if (!file) continue;

      const result = await downloadFile({
        data: file,
        filename: file.name,
        localPath: stub?.localFilePath
      });

      if (result.savedPath) {
        context.markSaved(fileId as FileId, result.savedPath);
      }
    }
    return null;
  }

  const result = await downloadFromUrl(
    context.downloadUrl,
    context.downloadFilename || 'download',
    context.downloadLocalPath || undefined
  );

  if (context.outputFileIds && result.savedPath) {
    for (const fileId of context.outputFileIds) {
      context.markSaved(fileId as FileId, result.savedPath);
    }
  }

  return result;
}
