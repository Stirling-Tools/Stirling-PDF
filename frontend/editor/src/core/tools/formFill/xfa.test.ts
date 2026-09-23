import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyXfa, readFormType } from "@app/tools/formFill/xfa";

const FPDF_GetFormType = vi.fn();
const openRawDocumentSafe = vi.fn();

vi.mock("@app/services/pdfiumService", () => ({
  getPdfiumModule: () => Promise.resolve({ FPDF_GetFormType }),
  openRawDocumentSafe: (...args: unknown[]) => openRawDocumentSafe(...args),
  closeDocAndFreeBuffer: () => {},
}));

const pdf = () => new Blob(["%PDF-1.7"], { type: "application/pdf" });

describe("classifyXfa", () => {
  it.each([
    [0, 3, "none"],
    [1, 3, "none"],
    [2, 3, "dynamic"],
    [3, 0, "dynamic"],
    [3, 3, "hybrid"],
  ] as const)(
    "reads form type %i with %i fields as %s",
    (type, fields, kind) => {
      expect(classifyXfa(type, fields)).toBe(kind);
    },
  );
});

describe("readFormType", () => {
  beforeEach(() => {
    FPDF_GetFormType.mockReset();
    openRawDocumentSafe.mockReset();
    openRawDocumentSafe.mockResolvedValue(7);
  });

  it("asks PDFium once per document", async () => {
    FPDF_GetFormType.mockReturnValue(3);
    const file = pdf();

    expect(await readFormType(file)).toBe(3);
    expect(await readFormType(file)).toBe(3);
    expect(FPDF_GetFormType).toHaveBeenCalledTimes(1);
  });

  it("answers 0 when PDFium cannot open the document", async () => {
    openRawDocumentSafe.mockRejectedValue(new Error("not a PDF"));

    expect(await readFormType(pdf())).toBe(0);
  });
});
