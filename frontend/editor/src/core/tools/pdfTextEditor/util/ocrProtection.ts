import type { TFunction } from "i18next";
import { getPdfAccess } from "@app/services/pdfPasswordStore";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { detectSaveRisks } from "@app/tools/pdfTextEditor/util/documentRisks";
import type { FileId } from "@app/types/file";

/** Checks native encryption too: a disk-opened document may not have a FileContext ID yet. */
export function getEditorOcrBlockedReason(
  doc: EditorDocument | null,
  fileId: FileId | null,
  t: TFunction,
): string | null {
  if (
    getPdfAccess(fileId)?.encrypted ||
    (doc && detectSaveRisks(doc).encrypted)
  ) {
    return t(
      "pdfTextEditor.inspector.ocrProtected",
      "OCR cannot keep this PDF's password protection. Use Remove Password to create an unprotected copy first.",
    );
  }
  return null;
}

/** Rejects OCR input and output while the source remains protected, even after session unlock. */
export function assertEditorOcrAllowed(
  doc: EditorDocument | null,
  fileId: FileId | null,
  t: TFunction,
): void {
  const reason = getEditorOcrBlockedReason(doc, fileId, t);
  if (reason) throw new Error(reason);
}
