import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@app/services/pdfiumScanQueue", () => ({
  runPdfiumScan: (task: () => Promise<unknown>) => task(),
}));

vi.mock("@app/services/documentBytesCache", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/services/documentBytesCache")>();
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const fixture = new Uint8Array(
    readFileSync(
      path.join(import.meta.dirname, "../tests/test-fixtures/big-sample.pdf"),
    ),
  ).buffer;
  return { ...actual, getDocumentBytes: vi.fn(async () => fixture) };
});

vi.mock("@app/services/pdfiumService", () => ({
  readRawFormType: vi.fn(async () => 0),
}));

import {
  documentHasFormFields,
  documentHasFormFieldsFor,
} from "@app/services/documentFormProbe";
import { getDocumentBytes } from "@app/services/documentBytesCache";
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

describe("documentHasFormFieldsFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const formlessFile = (lastModified: number): File =>
    new File([fixtureBytes("big-sample.pdf")], "big-sample.pdf", {
      lastModified,
    });

  it("seeds the answer from a buffer and reuses it for another File wrapper", async () => {
    const bytes = fixtureBytes("big-sample.pdf");
    const stamp = 1_700_000_000_000;

    expect(await documentHasFormFieldsFor(formlessFile(stamp), bytes)).toBe(
      false,
    );
    expect(getDocumentBytes).not.toHaveBeenCalled();

    // Same bytes and metadata, fresh object: the answer travels by file key.
    expect(await documentHasFormFieldsFor(formlessFile(stamp))).toBe(false);
    expect(getDocumentBytes).not.toHaveBeenCalled();
  });

  it("reads once for a Blob-only caller and memoizes the in-flight promise", async () => {
    const file = formlessFile(1_700_000_000_100);

    const [first, second] = await Promise.all([
      documentHasFormFieldsFor(file),
      documentHasFormFieldsFor(file),
    ]);

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(getDocumentBytes).toHaveBeenCalledTimes(1);
    expect(await documentHasFormFieldsFor(file)).toBe(false);
    expect(getDocumentBytes).toHaveBeenCalledTimes(1);
  });

  it("probes a different document separately", async () => {
    const other = new File([fixtureBytes("big-sample.pdf")], "big-sample.pdf", {
      lastModified: 1_700_000_000_200,
    });

    expect(await documentHasFormFieldsFor(other)).toBe(false);
    expect(getDocumentBytes).toHaveBeenCalledTimes(1);
  });
});
