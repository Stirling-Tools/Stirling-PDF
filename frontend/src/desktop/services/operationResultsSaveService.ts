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

      // Don't overwrite the original path if the output file type has changed
      // (e.g. a PDF→image conversion produces a ZIP, not a PDF — saving to the
      // original .pdf path would corrupt it). Fall back to a Save As dialog instead.
      const localPath = stub?.localFilePath;
      const outputExt = file.name.split('.').pop()?.toLowerCase();
      const originalExt = localPath?.split('.').pop()?.toLowerCase();
      const overwritePath = localPath && outputExt === originalExt ? localPath : undefined;

      const result = await downloadFile({
        data: file,
        filename: file.name,
        localPath: overwritePath
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
