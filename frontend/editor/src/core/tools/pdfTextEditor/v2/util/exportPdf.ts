import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumSave } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave";

/** Serialize the editor document to a Blob plus the download filename. */
export function exportToBlob(
  doc: EditorDocument,
  sourceName?: string | null,
): {
  blob: Blob;
  filename: string;
} {
  const bytes = PdfiumSave.serialize(doc);
  const blob = new Blob([bytes as unknown as ArrayBuffer], {
    type: "application/pdf",
  });
  // Derive from the opened file's name so downloads don't all collide on
  // a generic "edited.pdf".
  const base = (sourceName ?? "").replace(/\.pdf$/i, "").trim();
  return { blob, filename: base ? `${base}_edited.pdf` : "edited.pdf" };
}
