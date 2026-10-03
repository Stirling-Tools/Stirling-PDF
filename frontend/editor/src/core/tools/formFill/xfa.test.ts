import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyXfa, readFormType } from "@app/tools/formFill/xfa";

const readRawFormType = vi.fn();

vi.mock("@app/services/pdfiumService", () => ({
  readRawFormType: (...args: unknown[]) => readRawFormType(...args),
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
    readRawFormType.mockReset();
  });

  it("asks PDFium once per document", async () => {
    readRawFormType.mockResolvedValue(3);
    const file = pdf();

    expect(await readFormType(file)).toBe(3);
    expect(await readFormType(file)).toBe(3);
    expect(readRawFormType).toHaveBeenCalledTimes(1);
  });

  it("answers 0 when PDFium cannot open the document", async () => {
    readRawFormType.mockRejectedValue(new Error("not a PDF"));

    expect(await readFormType(pdf())).toBe(0);
  });

  it("answers 0 when the PDFium build cannot read the form type", async () => {
    readRawFormType.mockResolvedValue(null);

    expect(await readFormType(pdf())).toBe(0);
  });
});
