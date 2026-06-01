import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumSave } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave";

/** Serialize the editor document to a Blob plus the default filename. */
export function exportToBlob(doc: EditorDocument): {
  blob: Blob;
  filename: string;
} {
  const bytes = PdfiumSave.serialize(doc);
  const blob = new Blob([bytes as unknown as ArrayBuffer], {
    type: "application/pdf",
  });
  return { blob, filename: "edited.pdf" };
}
