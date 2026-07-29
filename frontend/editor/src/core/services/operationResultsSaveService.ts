import type { FileId, StirlingFileStub } from "@app/types/fileContext";
import { downloadFromUrl, DownloadResult } from "@app/services/downloadService";

export interface OperationSaveContext {
  downloadUrl: string | null;
  downloadFilename: string;
  downloadLocalPath?: string | null;
  outputFileIds?: string[] | null;
  getFile: (fileId: FileId) => File | undefined;
  getStub: (fileId: FileId) => StirlingFileStub | undefined;
  markSaved: (fileId: FileId, savedPath?: string) => void;
}

export async function saveOperationResults(
  context: OperationSaveContext,
): Promise<DownloadResult | null> {
  if (!context.downloadUrl) return null;

  // Results come straight from a blob URL, so the gate checks the output ids.
  const result = await downloadFromUrl({
    url: context.downloadUrl,
    filename: context.downloadFilename || "download",
    localPath: context.downloadLocalPath || undefined,
    fileIds: context.outputFileIds,
    verb: "save",
  });
  if (result.cancelled) return null;

  if (context.outputFileIds && result.savedPath) {
    for (const fileId of context.outputFileIds) {
      context.markSaved(fileId as FileId, result.savedPath);
    }
  }

  return result;
}
