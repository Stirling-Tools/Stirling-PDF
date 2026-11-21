import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { getDroppedBase14Chars } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";

// Only losses that are HIGH-confidence under the save path: signatures (the
// save goes incremental), XFA, encryption, and characters an edit had to drop.
export interface SaveRisks {
  signatures: number;
  xfaForm: boolean;
  encrypted: boolean;
  /** Distinct visible chars this session's edits couldn't render and dropped. */
  droppedChars: string[];
}

/**
 * Signatures that sign something. PDFium also counts a signature field no one
 * has signed yet, which has nothing to keep verifiable.
 */
export function signedSignatureCount(doc: EditorDocument): number {
  const m = doc.module;
  try {
    const count = m.FPDF_GetSignatureCount(doc.docPtr);
    let signed = 0;
    for (let i = 0; i < count; i++) {
      const signature = m.FPDF_GetSignatureObject(doc.docPtr, i);
      if (signature && m.FPDFSignatureObj_GetContents(signature, 0, 0) > 0)
        signed++;
    }
    return signed;
  } catch {
    return 0;
  }
}

/** True when changing pages or form fields would break a signature, the encryption or an XFA form. */
export function locksPages(risks: SaveRisks): boolean {
  return risks.signatures > 0 || risks.xfaForm || risks.encrypted;
}

/** Inspect the open document for content a full rewrite would damage. */
export function detectSaveRisks(doc: EditorDocument): SaveRisks {
  const m = doc.module;
  let signatures = 0;
  let xfaForm = false;
  let encrypted = false;
  signatures = signedSignatureCount(doc);
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
      "Saving this PDF may change its encryption or access restrictions.",
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
