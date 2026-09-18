import { describe, expect, it, vi } from "vitest";
import {
  snapshotAnnotAppearances,
  stripGeneratedAppearances,
} from "@app/tools/pdfTextEditor/pdfium/PdfiumAppearanceSnapshot";
import { PdfiumSave } from "@app/tools/pdfTextEditor/pdfium/PdfiumSave";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

function fakeAppearanceModule(opts: {
  annotCount: number;
  present: Set<string>;
  getApThrows?: Set<string>;
}) {
  const getAnnotCount = vi.fn(() => opts.annotCount);
  const closeAnnot = vi.fn();
  const getAnnot = vi.fn((_: number, index: number) => 100 + index);
  // Presence is per index:mode, mirroring the snapshot key format.
  const setAp = vi.fn(() => true);
  const getAp = vi.fn((annot: number, mode: number) => {
    const key = `${annot - 100}:${mode}`;
    if (opts.getApThrows?.has(key)) throw new Error("unreadable");
    return opts.present.has(key) ? 10 : 2;
  });
  return {
    module: {
      FPDFPage_GetAnnotCount: getAnnotCount,
      FPDFPage_GetAnnot: getAnnot,
      FPDFPage_CloseAnnot: closeAnnot,
      FPDFAnnot_GetAP: getAp,
      FPDFAnnot_SetAP: setAp,
    },
    getAnnotCount,
    getAnnot,
    closeAnnot,
    getAp,
    setAp,
  };
}

describe("snapshotAnnotAppearances", () => {
  it("returns null when the build lacks the entry points", () => {
    expect(snapshotAnnotAppearances({}, 1)).toBeNull();
    expect(
      snapshotAnnotAppearances({ FPDFPage_GetAnnotCount: () => 0 }, 1),
    ).toBeNull();
  });

  it("records only modes with an appearance present", () => {
    const { module, getAp } = fakeAppearanceModule({
      annotCount: 2,
      present: new Set(["0:0", "1:2"]),
    });
    const snap = snapshotAnnotAppearances(module, 9);
    expect(snap).toEqual(new Set(["0:0", "1:2"]));
    // 1 count call plus 2 annots times 3 modes.
    expect(getAp).toHaveBeenCalledTimes(6);
  });

  it("costs one wasm call for a page with no annotations", () => {
    const { module, getAnnotCount, getAp } = fakeAppearanceModule({
      annotCount: 0,
      present: new Set(),
    });
    expect(snapshotAnnotAppearances(module, 9)).toEqual(new Set());
    expect(getAnnotCount).toHaveBeenCalledTimes(1);
    expect(getAp).not.toHaveBeenCalled();
  });
});

describe("stripGeneratedAppearances", () => {
  it("returns 0 when the build lacks the entry points", () => {
    expect(stripGeneratedAppearances({}, 1, new Set())).toBe(0);
  });

  it("deletes only appearances created after the snapshot", () => {
    const { module, setAp } = fakeAppearanceModule({
      annotCount: 2,
      present: new Set(["0:0", "0:1", "1:0"]),
    });
    const removed = stripGeneratedAppearances(module, 9, new Set(["0:0"]));
    expect(removed).toBe(2);
    expect(setAp).toHaveBeenCalledWith(100, 1, 0);
    expect(setAp).toHaveBeenCalledWith(101, 0, 0);
    expect(setAp).not.toHaveBeenCalledWith(100, 0, 0);
  });

  it("skips unreadable appearances instead of aborting", () => {
    const { module, setAp } = fakeAppearanceModule({
      annotCount: 1,
      present: new Set(["0:0", "0:1"]),
      getApThrows: new Set(["0:0"]),
    });
    expect(stripGeneratedAppearances(module, 9, new Set())).toBe(1);
    expect(setAp).toHaveBeenCalledWith(100, 1, 0);
  });
});

describe("PdfiumSave appearance stripping", () => {
  function fakeSaveDoc(
    pages: Array<{ regenerated: boolean; snap: Set<string> | null }>,
  ) {
    const setAp = vi.fn(() => true);
    const text = `%PDF-1.7\n${"x".repeat(400)}\n%%EOF\n`;
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    const memory = { buffer: new ArrayBuffer(64 * 1024) };
    const heap = new Uint8Array(memory.buffer);
    const BASE = 1024;
    heap.set(bytes, BASE);
    const module: Record<string, unknown> = {
      FPDFPage_GetAnnotCount: () => 1,
      FPDFPage_GetAnnot: () => 55,
      FPDFPage_CloseAnnot: vi.fn(),
      FPDFAnnot_GetAP: () => 10,
      FPDFAnnot_SetAP: setAp,
      PDFiumExt_OpenFileWriter: () => 7,
      PDFiumExt_CloseFileWriter: vi.fn(),
      PDFiumExt_SaveAsCopy: () => 1,
      PDFiumExt_GetFileWriterSize: () => bytes.length,
      PDFiumExt_GetFileWriterData: (_w: number, out: number, size: number) => {
        heap.copyWithin(out, BASE, BASE + size);
      },
      pdfium: {
        wasmExports: { malloc: () => 8192, free: vi.fn(), memory },
      },
    };
    const doc = {
      module,
      docPtr: 42,
      loadedPages: () =>
        pages.map((p, i) => ({
          index: i,
          pagePtr: 1000 + i,
          dirty: false,
          needsGenerateContent: false,
          regenerated: p.regenerated,
          initialAnnotAPs: p.snap,
          flushGenerate: () => {},
          clearDirty: () => {},
        })),
    } as unknown as EditorDocument;
    return { doc, setAp };
  }

  it("strips clean pages but keeps regenerated ones", () => {
    const { doc, setAp } = fakeSaveDoc([
      { regenerated: false, snap: new Set() },
      { regenerated: true, snap: new Set() },
      { regenerated: false, snap: null },
    ]);
    PdfiumSave.serialize(doc);
    // One clean page with 1 annot times 3 modes.
    expect(setAp).toHaveBeenCalledTimes(3);
  });
});
