// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// A fine PDF must never be labelled damaged because PDFium was handed bytes that are not the file.

const openRawDocumentSafe = vi.hoisted(() => vi.fn());
const getDocumentBytes = vi.hoisted(() => vi.fn());
vi.mock("@editor/services/pdfiumService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@editor/services/pdfiumService")>()),
  getPdfiumModule: vi.fn().mockResolvedValue({}),
  openRawDocumentSafe,
}));
vi.mock("@editor/services/documentBytesCache", () => ({ getDocumentBytes }));

import { PdfiumOpenError } from "@editor/services/pdfiumService";
import { generateThumbnailPairWithMetadata } from "@editor/utils/thumbnailUtils";

const FORMAT_ERROR = 3;
const pdf = (body: string) =>
  new File([body], "doc.pdf", { type: "application/pdf" });
const bytesOf = (file: File) => new Uint8Array(file.size).buffer;

beforeEach(() => {
  openRawDocumentSafe.mockReset();
  getDocumentBytes.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("damage detection", () => {
  it("flags a whole file PDFium rejects as malformed", async () => {
    const file = pdf("%PXF-1.7 broken");
    getDocumentBytes.mockResolvedValue(bytesOf(file));
    openRawDocumentSafe.mockRejectedValue(new PdfiumOpenError(FORMAT_ERROR));
    const { unrotated } = await generateThumbnailPairWithMetadata(file);
    expect(unrotated.isDamaged).toBe(true);
  });

  it("does not flag a short read, which says nothing about the file", async () => {
    const file = pdf("%PDF-1.7 a perfectly fine document");
    getDocumentBytes.mockResolvedValue(new ArrayBuffer(0));
    openRawDocumentSafe.mockRejectedValue(new PdfiumOpenError(FORMAT_ERROR));
    const { unrotated } = await generateThumbnailPairWithMetadata(file);
    expect(unrotated.isDamaged).toBe(false);
  });

  it("does not flag a file that looks encrypted", async () => {
    const file = pdf("%PDF-1.7 trailer << /Encrypt 9 0 R >>");
    getDocumentBytes.mockResolvedValue(bytesOf(file));
    openRawDocumentSafe.mockRejectedValue(new PdfiumOpenError(FORMAT_ERROR));
    const { unrotated } = await generateThumbnailPairWithMetadata(file);
    expect(unrotated.isDamaged).toBe(false);
  });

  it("does not flag a memory failure", async () => {
    const file = pdf("%PDF-1.7");
    getDocumentBytes.mockResolvedValue(bytesOf(file));
    openRawDocumentSafe.mockRejectedValue(
      new Error("Unable to allocate memory for this PDF"),
    );
    const { unrotated } = await generateThumbnailPairWithMetadata(file);
    expect(unrotated.isDamaged).toBe(false);
  });
});
