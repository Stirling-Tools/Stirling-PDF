import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { getDroppedBase14Chars } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Things a save would damage. PDFium's `SaveAsCopy` does a full rewrite, so
 * we only flag losses that are HIGH-confidence under that path:
 *  - digital signatures: any byte-level rewrite invalidates them.
 *  - XFA forms: PDFium does not round-trip XFA, so the dynamic form is lost.
 *  - encryption: SaveAsCopy writes the copy UNENCRYPTED and drops the
 *    permission bits, so an encrypted source loses its protection - we warn.
 *  - droppedChars: chars an EDIT couldn't represent in any available font and
 *    silently discarded (a new CJK / Arabic char typed into a doc whose fonts
 *    don't cover it, with no bundled fallback). This is real data loss the user
 *    just typed, so - unlike the passive risks above - we always surface it.
 * Plain AcroForm fields ARE preserved by SaveAsCopy, so they are deliberately
 * not flagged - warning on them would be crying wolf. Tagged/structure data is
 * likewise not flagged: a bare struct tree is common and content regeneration
 * does not reliably break it, so a warning would cry wolf. (A precise
 * tagged/OCG warning would require detecting a StructTreeRoot / OCProperties
 * AND that an edited page actually referenced them - deferred as low-priority.)
 */
export interface SaveRisks {
  signatures: number;
  xfaForm: boolean;
  encrypted: boolean;
  /** Distinct visible chars this session's edits couldn't render and dropped. */
  droppedChars: string[];
}

/** Inspect the open document for content a full rewrite would damage. */
export function detectSaveRisks(doc: EditorDocument): SaveRisks {
  const m = doc.module;
  let signatures = 0;
  let xfaForm = false;
  let encrypted = false;
  try {
    signatures = Math.max(0, m.FPDF_GetSignatureCount(doc.docPtr));
  } catch {
    /* API absent in older builds - treat as no signatures */
  }
  try {
    // FORMTYPE: 0 none, 1 acroform, 2 xfa-full, 3 xfa-foreground.
    const formType = m.FPDF_GetFormType(doc.docPtr);
    xfaForm = formType === 2 || formType === 3;
  } catch {
    /* API absent - treat as no XFA */
  }
  try {
    // Revision -1 means unencrypted; >= 0 means an encryption dict is present.
    const rev = m.FPDF_GetSecurityHandlerRevision(doc.docPtr);
    encrypted = rev >= 0;
  } catch {
    /* API absent - treat as unencrypted */
  }
  return {
    signatures,
    xfaForm,
    encrypted,
    droppedChars: getDroppedBase14Chars(),
  };
}

export function hasSaveRisks(r: SaveRisks): boolean {
  return (
    r.signatures > 0 || r.xfaForm || r.encrypted || r.droppedChars.length > 0
  );
}

/** Human-readable bullet lines describing what the save would damage. */
export function describeSaveRisks(r: SaveRisks): string[] {
  const out: string[] = [];
  if (r.signatures > 0) {
    out.push(
      r.signatures === 1
        ? "1 digital signature will be invalidated."
        : `${r.signatures} digital signatures will be invalidated.`,
    );
  }
  if (r.xfaForm) out.push("Interactive XFA form data may be lost.");
  if (r.encrypted) {
    out.push(
      "This PDF is encrypted; the saved copy will NOT be encrypted (password and access restrictions are removed).",
    );
  }
  if (r.droppedChars.length > 0) {
    const shown = r.droppedChars.slice(0, 12).join(" ");
    const more =
      r.droppedChars.length > 12
        ? ` (+${r.droppedChars.length - 12} more)`
        : "";
    out.push(
      `Some characters could not be embedded in any available font and were dropped: ${shown}${more}`,
    );
  }
  return out;
}
