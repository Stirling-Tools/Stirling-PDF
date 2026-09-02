import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { preserveShadings } from "@app/tools/pdfTextEditor/pdfdoc/passes/preserveShadings";
import { PdfiumSave } from "@app/tools/pdfTextEditor/pdfium/PdfiumSave";
import { assertIncrementalAppend } from "@app/tools/pdfTextEditor/util/savedBytes";

/** Serialize the editor document to a Blob plus the download filename. */
export async function exportToBlob(
  doc: EditorDocument,
  sourceName?: string | null,
): Promise<{
  blob: Blob;
  filename: string;
}> {
  // Nothing was ever written to a page, so PDFium has nothing to contribute:
  // handing back what we opened keeps the file byte-identical. Rewriting it
  // changed the bytes of 8 of this suite's 10 fixtures and inflated the small
  // ones by up to 35% - for no edit at all.
  if (documentIsPristine(doc)) {
    return { blob: pdfBlob(doc.openedBytes), filename: exportName(sourceName) };
  }

  // A signed document is appended to rather than rewritten, so the bytes the
  // signature covers are still there and still verify for their revision.
  const incremental = documentIsSigned(doc);
  // Must be read AFTER serialize: serialize is what marks pages regenerated,
  // so reading first always yielded an empty list and silently skipped the
  // shading repair on the first save after an edit.
  let bytes = PdfiumSave.serialize(doc, { incremental });
  const regenerated = doc.regeneratedPages();

  if (regenerated.length > 0 && doc.openedBytes.length > 0) {
    try {
      const repaired = await preserveShadings(bytes, doc.openedBytes, {
        pages: regenerated,
      });
      // The repair appends its own revision, so it may only ever grow the file
      // - a shorter result would mean it rewrote what it was handed.
      if (repaired && (!incremental || repaired.length >= bytes.length)) {
        bytes = repaired;
      }
    } catch {
      /* the unrepaired save is still a correct save */
    }
  }

  // Checked LAST, on the bytes that will actually be written: the incremental
  // path is the tool's signature-preserving promise, and a promise nothing
  // verifies is just a comment.
  if (incremental) assertIncrementalAppend(bytes, doc.openedBytes);

  return { blob: pdfBlob(bytes), filename: exportName(sourceName) };
}

function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as ArrayBuffer], {
    type: "application/pdf",
  });
}

// Derive from the opened file's name so downloads don't all collide on
// a generic "edited.pdf".
function exportName(sourceName?: string | null): string {
  const base = (sourceName ?? "").replace(/\.pdf$/i, "").trim();
  return base ? `${base}_edited.pdf` : "edited.pdf";
}

/**
 * True when no page's content stream has been regenerated and none is waiting
 * to be. `regenerated` is sticky, so this stays false for every later save in
 * a session that has edited once - a second save can never hand back the
 * pre-edit bytes and silently revert the first.
 */
function documentIsPristine(doc: EditorDocument): boolean {
  if (doc.openedBytes.length === 0) return false;
  return doc
    .loadedPages()
    .every((p) => !p.regenerated && !p.needsGenerateContent);
}

function documentIsSigned(doc: EditorDocument): boolean {
  try {
    return doc.module.FPDF_GetSignatureCount(doc.docPtr) > 0;
  } catch {
    return false;
  }
}
