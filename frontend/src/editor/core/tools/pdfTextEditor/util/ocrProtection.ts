import type { TFunction } from "i18next";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { detectSaveRisks } from "@editor/tools/pdfTextEditor/util/documentRisks";
import type { FileId } from "@editor/types/file";

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
      "OCR cannot yet preserve this PDF's protection. The protected original remains available for viewing.",
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
