import i18n from "i18next";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  StructureEditError,
  applyStructureEdits,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import { repairStructure } from "@editor/tools/pdfTextEditor/pdfdoc/passes/repairStructure";
import { preserveShadings } from "@editor/tools/pdfTextEditor/pdfdoc/passes/preserveShadings";
import { PdfiumSave } from "@editor/tools/pdfTextEditor/pdfium/PdfiumSave";
import {
  assertIncrementalAppend,
  assertSavedPdf,
} from "@editor/tools/pdfTextEditor/util/savedBytes";

/** Serialize the editor document to a Blob plus the download filename. */
export async function exportToBlob(
  doc: EditorDocument,
  sourceName?: string | null,
): Promise<{
  blob: Blob;
  filename: string;
}> {
  const structureEdits = doc.structureEdits();
  // A signed document is appended to rather than rewritten, so the bytes the
  // signature covers are still there and still verify for their revision.
  const incremental = documentIsSigned(doc);
  let bytes: Uint8Array;
  if (documentIsPristine(doc)) {
    // Nothing was ever written to a page, so PDFium has nothing to contribute:
    // starting from what we opened keeps the file byte-identical. Rewriting it
    // changed the bytes of 8 of this suite's 10 fixtures and inflated the small
    // ones by up to 35% - for no edit at all.
    if (structureEdits.length === 0) {
      return {
        blob: pdfBlob(doc.openedBytes),
        filename: exportName(sourceName),
      };
    }
    bytes = doc.openedBytes;
  } else {
    bytes = await serializeEdits(doc, incremental);
  }

  // Throws rather than dropping them: a description the user wrote that the
  // saved file silently lacks is worse than a save that reports it failed.
  try {
    bytes = await applyStructureEdits(bytes, structureEdits);
  } catch (err) {
    if (!(err instanceof StructureEditError)) throw err;
    // Its failures name pages and MCIDs: for a bug report, not for the user.
    console.error(err);
    throw new Error(
      i18n.t(
        "pdfTextEditor.inspector.accessibility.saveFailed",
        "Your accessibility changes couldn't be saved, so the file wasn't saved. Undo them and try again.",
      ),
      { cause: err },
    );
  }

  // After the edits: when the content an element described was deleted, the
  // repair removes the ParentTree slot an edit to that element is addressed by,
  // and the edit would then fail the save.
  const regenerated = doc.regeneratedPages();
  if (regenerated.length > 0) {
    try {
      const repaired = await repairStructure(bytes, {
        pages: regenerated,
        original: doc.openedBytes,
      });
      if (repaired) bytes = repaired;
    } catch {
      /* the unrepaired tags are what every save wrote before this pass */
    }
  }

  // Re-checked after the repairs: `PdfiumSave.serialize` validated its own
  // output, but the passes since may have swapped in a different buffer, and
  // these are the bytes the workspace file is overwritten with.
  assertSavedPdf(bytes);
  if (incremental) assertIncrementalAppend(bytes, doc.openedBytes);

  return { blob: pdfBlob(bytes), filename: exportName(sourceName) };
}

async function serializeEdits(
  doc: EditorDocument,
  incremental: boolean,
): Promise<Uint8Array> {
  commitPendingFormRemovals(doc);

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
      if (repaired && (!incremental || repaired.length >= bytes.length)) {
        bytes = repaired;
      }
    } catch {
      /* the unrepaired save is still a correct save */
    }
  }
  return bytes;
}

interface FormRemovalModule {
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

/**
 * Remove the form children that DeleteShapeCommand only hid. Done here, on the
 * user's save, rather than in every serialize: other serializes (the charcode
 * probe) must not make a delete permanent while it can still be undone.
 */
function commitPendingFormRemovals(doc: EditorDocument): void {
  const m = doc.module as unknown as FormRemovalModule;
  for (const page of doc.loadedPages()) {
    if (page.pendingFormRemovals.size === 0) continue;
    for (const [objPtr, formPtr] of page.pendingFormRemovals) {
      m.FPDFFormObj_RemoveObject?.(formPtr, objPtr);
    }
    page.pendingFormRemovals.clear();
    page.markNeedsGenerate();
  }
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
