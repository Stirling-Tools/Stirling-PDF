import type { FileId, StirlingFileStub } from "@app/types/fileContext";
import { downloadFromUrl, DownloadResult } from "@app/services/downloadService";
import { requestReviewClearance } from "@app/services/reviewGate";

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

  // Results download straight from a blob URL, so the gate is checked here
  // against the output ids rather than inside the download service.
  const cleared = await requestReviewClearance(
    (context.outputFileIds ?? []) as string[],
    "save",
  );
  if (!cleared) return null;

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
