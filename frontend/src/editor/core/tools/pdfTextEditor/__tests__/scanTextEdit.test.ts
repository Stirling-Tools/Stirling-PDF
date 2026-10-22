import { describe, it, expect, vi } from "vitest";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import {
  renderScanEdit,
  scanDrawnSize,
  type ScanEditState,
} from "@app/tools/pdfTextEditor/commands/scanTextEdit";
import {
  emitTextLine,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";

vi.mock("@app/tools/pdfTextEditor/commands/editTextHelpers", () => ({
  emitTextLine: vi.fn(() => [21, 22, 23]),
  emitFillRect: () => 0,
  measureObjSpanPt: () => null,
  removeAndDestroyObject: vi.fn(),
  removeMemberPtrs: vi.fn(),
}));
vi.mock("@app/tools/pdfTextEditor/pdfium/BackgroundSampler", () => ({
  INK_SCALE: 1,
  sampleBackground: () => ({ fill: { r: 255, g: 255, b: 255, a: 255 } }),
}));

function fixture() {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  const doc = { module: {}, page: () => page } as unknown as EditorDocument;
  const run = new TextRun({
    id: "ocr",
    pageIndex: 0,
    pdfiumObjPtr: 11,
    text: "HELLO",
    bounds: { x: 100, y: 690, width: 40, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 100, f: 690 },
    fontId: "Helvetica",
    fontSize: 12,
    fontSubset: false,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    renderMode: 3,
  });
  const state: ScanEditState = {
    lines: [
      {
        text: "HELLO",
        baseline: 690,
        height: 10,
        words: [
          {
            text: "HELLO",
            start: 0,
            x: 100,
            right: 140,
            ptr: 11,
            container: 90,
            fontSize: 12,
          },
        ],
      },
    ],
    fontPtr: 0,
    created: [],
    textPtrs: [],
    lifted: new Set(),
    inks: new Map([["0:0:0", null]]),
    patches: new Map(),
    override: { dx: 0, dy: 0 },
    classes: [],
    block: null,
    neighbours: [],
  };
  run.scanEdit = state;
  return { doc, page, run, state };
}

describe("OCR word restoration", () => {
  it("tracks every invisible object through delete, undo, and repeated edits", () => {
    const { doc, page, run, state } = fixture();
    renderScanEdit(doc, page, run, state, "");
    renderScanEdit(doc, page, run, state, "HELLO");
    expect(emitTextLine).toHaveBeenCalledWith(
      expect.objectContaining({ renderMode: 3 }),
    );
    expect(run.paragraphLeafPtrs).toEqual([21, 22, 23]);
    expect(run.paragraphLeafContainers).toEqual([0, 0, 0]);
    renderScanEdit(doc, page, run, state, "");
    expect(removeMemberPtrs).toHaveBeenLastCalledWith(
      doc.module,
      page,
      [21, 22, 23],
      expect.any(Map),
      0,
    );
    expect(run.paragraphLeafPtrs).toEqual([]);
    renderScanEdit(doc, page, run, state, "HELLO");
    expect(run.paragraphLeafPtrs).toEqual([21, 22, 23]);
  });

  it("reports the rendering fallback size when scan style measurement fails", () => {
    const { doc, page, run } = fixture();
    expect(scanDrawnSize(doc, page, run)).toBeCloseTo(10 / 0.718);
    run.scanEdit!.override.fontSize = 18;
    expect(scanDrawnSize(doc, page, run)).toBe(18);
  });
});
