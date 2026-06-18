import { describe, it, expect } from "vitest";
import {
  detectSaveRisks,
  hasSaveRisks,
  describeSaveRisks,
} from "@app/tools/pdfTextEditor/v2/util/documentRisks";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

function mkDoc(opts: {
  signatures?: number;
  formType?: number;
  throwOnSig?: boolean;
}): EditorDocument {
  return {
    docPtr: 1,
    module: {
      FPDF_GetSignatureCount: () => {
        if (opts.throwOnSig) throw new Error("no API");
        return opts.signatures ?? 0;
      },
      FPDF_GetFormType: () => opts.formType ?? 0,
    },
  } as unknown as EditorDocument;
}

describe("detectSaveRisks", () => {
  it("reports no risk for a plain document", () => {
    const r = detectSaveRisks(mkDoc({}));
    expect(r).toEqual({ signatures: 0, xfaForm: false });
    expect(hasSaveRisks(r)).toBe(false);
  });

  it("flags digital signatures", () => {
    const r = detectSaveRisks(mkDoc({ signatures: 2 }));
    expect(r.signatures).toBe(2);
    expect(hasSaveRisks(r)).toBe(true);
    expect(describeSaveRisks(r)).toEqual([
      "2 digital signatures will be invalidated.",
    ]);
  });

  it("flags XFA forms (formType 2/3) but not plain AcroForm (1)", () => {
    expect(detectSaveRisks(mkDoc({ formType: 1 })).xfaForm).toBe(false);
    expect(detectSaveRisks(mkDoc({ formType: 2 })).xfaForm).toBe(true);
    expect(detectSaveRisks(mkDoc({ formType: 3 })).xfaForm).toBe(true);
  });

  it("singular wording for one signature", () => {
    expect(describeSaveRisks({ signatures: 1, xfaForm: false })).toEqual([
      "1 digital signature will be invalidated.",
    ]);
  });

  it("clamps negative signature counts and survives a missing API", () => {
    expect(detectSaveRisks(mkDoc({ signatures: -1 })).signatures).toBe(0);
    expect(detectSaveRisks(mkDoc({ throwOnSig: true })).signatures).toBe(0);
  });

  it("combines both risks", () => {
    const r = detectSaveRisks(mkDoc({ signatures: 1, formType: 2 }));
    expect(describeSaveRisks(r)).toEqual([
      "1 digital signature will be invalidated.",
      "Interactive XFA form data may be lost.",
    ]);
  });
});
