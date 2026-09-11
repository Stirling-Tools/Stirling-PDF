import { isStirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { assertFilesNotBlocked } from "@app/services/policyFileGuard";

/** Hands a produced PDF blob to EmbedPdfViewer, which reloads the file preserving scroll/rotation. */
export const FORM_APPLY_EVENT = "formfill:apply";

export interface FormApplyDetail {
  blob: Blob;
  /** Prevents an asynchronous save from replacing a different viewer file. */
  sourceFileId?: FileId;
}

/** Dispatch a produced PDF blob to the viewer for reload + refresh. */
export function dispatchFormApply(
  blob: Blob,
  sourceFile?: File | Blob | null,
): void {
  const sourceFileId =
    sourceFile && isStirlingFile(sourceFile) ? sourceFile.fileId : undefined;
  assertFilesNotBlocked(sourceFileId ? [sourceFileId] : []);
  window.dispatchEvent(
    new CustomEvent<FormApplyDetail>(FORM_APPLY_EVENT, {
      detail: { blob, sourceFileId },
    }),
  );
}
