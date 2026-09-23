import { describe, expect, it, vi } from "vitest";
import { PdfiumSave } from "@app/tools/pdfTextEditor/pdfium/PdfiumSave";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

const MIN_PDF = `%PDF-1.7\n${"x".repeat(400)}\n%%EOF\n`;

interface FakeOptions {
  saveResult?: number;
  flaggedResult?: boolean | null;
  output?: string;
}

function fakeDoc(opts: FakeOptions = {}) {
  const text = opts.output ?? MIN_PDF;
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  const memory = { buffer: new ArrayBuffer(64 * 1024) };
  const heap = new Uint8Array(memory.buffer);
  const BASE = 1024;

  const saveAsCopy = vi.fn(() => {
    heap.set(bytes, BASE);
    return opts.saveResult ?? 1;
  });
  const flagged = vi.fn(() => {
    heap.set(bytes, BASE);
    return opts.flaggedResult ?? true;
  });

  const module: Record<string, unknown> = {
    PDFiumExt_OpenFileWriter: () => 7,
    PDFiumExt_CloseFileWriter: vi.fn(),
    PDFiumExt_SaveAsCopy: saveAsCopy,
    PDFiumExt_GetFileWriterSize: () => bytes.length,
    PDFiumExt_GetFileWriterData: (_w: number, out: number, size: number) => {
      heap.copyWithin(out, BASE, BASE + size);
    },
    pdfium: {
      wasmExports: { malloc: () => 8192, free: vi.fn(), memory },
    },
  };
  if (opts.flaggedResult !== null) module.FPDF_SaveAsCopy = flagged;

  const doc = {
    module,
    docPtr: 42,
    loadedPages: () => [],
  } as unknown as EditorDocument;
  return { doc, saveAsCopy, flagged };
}

describe("PdfiumSave failure detection", () => {
  it("returns the bytes when PDFium reports success", () => {
    const { doc } = fakeDoc();
    expect(PdfiumSave.serialize(doc).length).toBe(MIN_PDF.length);
  });

  it("throws when PDFium's save returns false", () => {
    const { doc } = fakeDoc({ saveResult: 0 });
    expect(() => PdfiumSave.serialize(doc)).toThrow(/could not serialize/i);
  });

  it("throws when the flagged incremental save returns false", () => {
    const { doc } = fakeDoc({ flaggedResult: false });
    expect(() => PdfiumSave.serialize(doc, { incremental: true })).toThrow(
      /could not serialize/i,
    );
  });

  it("throws when the writer hands back an empty buffer", () => {
    const { doc } = fakeDoc({ output: "" });
    expect(() => PdfiumSave.serialize(doc)).toThrow(/too short/i);
  });

  it("throws when the writer hands back something that is not a PDF", () => {
    const { doc } = fakeDoc({ output: "N".repeat(2048) });
    expect(() => PdfiumSave.serialize(doc)).toThrow(/PDF header/i);
  });

  it("uses the flagged entry point for an incremental save", () => {
    const { doc, flagged, saveAsCopy } = fakeDoc();
    PdfiumSave.serialize(doc, { incremental: true });
    expect(flagged).toHaveBeenCalledWith(42, 7, 1);
    expect(saveAsCopy).not.toHaveBeenCalled();
  });

  it("refuses to silently full-rewrite when the flagged entry point is gone", () => {
    const { doc, saveAsCopy } = fakeDoc({ flaggedResult: null });
    expect(() => PdfiumSave.serialize(doc, { incremental: true })).toThrow(
      /FPDF_SaveAsCopy/,
    );
    expect(saveAsCopy).not.toHaveBeenCalled();
  });

  it("still uses the plain entry point when incremental was not asked for", () => {
    const { doc, saveAsCopy, flagged } = fakeDoc();
    PdfiumSave.serialize(doc);
    expect(saveAsCopy).toHaveBeenCalledWith(42, 7);
    expect(flagged).not.toHaveBeenCalled();
  });
});
