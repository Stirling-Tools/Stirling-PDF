import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { preserveShadings } from "@app/tools/pdfTextEditor/v2/pdfdoc/passes/preserveShadings";
import { PdfiumSave } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave";

/** Serialize the editor document to a Blob plus the download filename. */
export async function exportToBlob(
  doc: EditorDocument,
  sourceName?: string | null,
): Promise<{
  blob: Blob;
  filename: string;
}> {
  // A signed document is appended to rather than rewritten, so the bytes the
  // signature covers are still there and still verify for their revision.
  const incremental = documentIsSigned(doc);
  const regenerated = doc.regeneratedPages();
  let bytes = PdfiumSave.serialize(doc, { incremental });

  if (regenerated.length > 0) {
    try {
      const repaired = await preserveShadings(bytes, doc.openedBytes, {
        pages: regenerated,
      });
      if (repaired) bytes = repaired;
    } catch {
      /* the unrepaired save is still a correct save */
    }
  }

  const blob = new Blob([bytes as unknown as ArrayBuffer], {
    type: "application/pdf",
  });
  // Derive from the opened file's name so downloads don't all collide on
  // a generic "edited.pdf".
  const base = (sourceName ?? "").replace(/\.pdf$/i, "").trim();
  return { blob, filename: base ? `${base}_edited.pdf` : "edited.pdf" };
}

function documentIsSigned(doc: EditorDocument): boolean {
  try {
    return doc.module.FPDF_GetSignatureCount(doc.docPtr) > 0;
  } catch {
    return false;
  }
}
