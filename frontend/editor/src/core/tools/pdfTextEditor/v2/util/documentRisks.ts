import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { getDroppedBase14Chars } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

// Only losses that are HIGH-confidence under the save path: signatures (the
// save goes incremental), XFA, encryption, and characters an edit had to drop.
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
    const subject =
      r.signatures === 1
        ? "This document carries a digital signature"
        : `This document carries ${r.signatures} digital signatures`;
    out.push(
      `${subject}. Your changes are appended as a new revision, so the signed version stays ` +
        "verifiable, but the document will report as modified since it was signed.",
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
