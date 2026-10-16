import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@app/services/pdfiumScanQueue", () => ({
  runPdfiumScan: (task: () => Promise<unknown>) => task(),
}));

vi.mock("@app/services/pdfiumService", () => ({
  readRawFormType: vi.fn(async () => 0),
}));

import { documentHasFormFields } from "@app/services/documentFormProbe";
import { readRawFormType } from "@app/services/pdfiumService";
import { hasAcroForm } from "@app/utils/asciiBytes";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";

// Copy into a jsdom-realm ArrayBuffer; pdf-lib rejects a Node-realm one.
const fixtureBytes = (name: string): ArrayBuffer =>
  new Uint8Array(
    readFileSync(
      path.join(import.meta.dirname, "../tests/test-fixtures", name),
    ),
  ).buffer;

describe("documentHasFormFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readRawFormType as Mock).mockResolvedValue(0);
  });

  it("finds a compressed-catalog form the literal scan misses", async () => {
    const bytes = fixtureBytes("form-compressed-catalog.pdf");
    expect(hasAcroForm(new Uint8Array(bytes))).toBe(false);

    expect(await documentHasFormFields(bytes)).toBe(true);
  });

  it("returns false for a form-less document", async () => {
    expect(await documentHasFormFields(fixtureBytes("big-sample.pdf"))).toBe(
      false,
    );
  });

  it("falls back to PDFium when pdf-lib cannot parse the file", async () => {
    const pdfLib = await import("@cantoo/pdf-lib");
    const load = vi
      .spyOn(pdfLib.PDFDocument, "load")
      .mockRejectedValueOnce(new Error("unparseable"));
    const bytes = new TextEncoder().encode("%PDF-1.7").buffer;
    (readRawFormType as Mock).mockResolvedValue(1);

    expect(await documentHasFormFields(bytes)).toBe(true);
    expect(readRawFormType).toHaveBeenCalledTimes(1);
    load.mockRestore();
  });

  it("treats an unknown form type as a possible form", async () => {
    const pdfLib = await import("@cantoo/pdf-lib");
    const load = vi
      .spyOn(pdfLib.PDFDocument, "load")
      .mockRejectedValueOnce(new Error("unparseable"));
    const bytes = new TextEncoder().encode("%PDF-1.7").buffer;
    (readRawFormType as Mock).mockResolvedValue(null);

    expect(await documentHasFormFields(bytes)).toBe(true);
    load.mockRestore();
  });

  it("does not open a large unparseable file in PDFium", async () => {
    const pdfLib = await import("@cantoo/pdf-lib");
    const load = vi
      .spyOn(pdfLib.PDFDocument, "load")
      .mockRejectedValueOnce(new Error("unparseable"));
    const bytes = new TextEncoder().encode("%PDF-1.7").buffer;

    expect(await documentHasFormFields(bytes, LARGE_PDF_PARSE_LIMIT)).toBe(
      false,
    );
    expect(readRawFormType).not.toHaveBeenCalled();
    load.mockRestore();
  });
});
