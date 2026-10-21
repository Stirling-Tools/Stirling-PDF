import { describe, it, expect, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import { adoptedTableModel } from "@app/tools/pdfTextEditor/util/tableAdoption";
import { ImageObject } from "@app/tools/pdfTextEditor/model/ImageObject";

vi.mock("@app/tools/pdfTextEditor/commands/editTextHelpers", () => ({
  measureObjSpanPt: () => null,
}));

function fixture() {
  const page = new Page({ index: 0, pagePtr: 1, width: 612, height: 792 });
  const table = new TableModel({
    id: "p0-table-0",
    pageIndex: 0,
    colEdges: [100, 200, 300],
    rowEdges: [700, 670, 640],
    cellRuns: [
      ["ocr", null],
      [null, null],
    ],
    hLinePtrs: [],
    vLinePtrs: [],
    lineWidth: 1,
    fontSize: 11,
    pageRuled: true,
  }).snapshot();
  const module = {} as WrappedPdfiumModule;
  return { page, table, module };
}

describe("adopted table ownership", () => {
  it("leaves a shared path on the page while adopting exclusively owned rules", () => {
    const { page, table, module } = fixture();
    const rule = {
      x: 100,
      y: 670,
      width: 200,
      height: 0,
      ptr: 41,
      thickness: 1,
      color: { r: 0, g: 0, b: 0, a: 255 },
    };
    page.setRules([rule, { ...rule, x: 350 }, { ...rule, y: 640, ptr: 42 }]);
    const model = adoptedTableModel(module, page, table);
    expect(model.hLinePtrs).toEqual([42]);
    expect(model.ruled).toBe(true);
    page.setRules([rule, { ...rule, x: 350 }]);
    expect(adoptedTableModel(module, page, table).ruled).toBe(false);
  });

  it("detects a scanned table from cached render modes without the optional accessor", () => {
    const { page, table, module } = fixture();
    page.setImages([
      new ImageObject({
        id: "scan",
        pageIndex: 0,
        pdfiumObjPtr: 50,
        bounds: table.bounds,
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      }),
    ]);
    const run = new TextRun({
      id: "ocr",
      pageIndex: 0,
      pdfiumObjPtr: 51,
      text: "First",
      bounds: table.bounds,
      matrix: { a: 1, b: 0, c: 0, d: 1, e: 100, f: 670 },
      fontId: "Helvetica",
      fontSize: 11,
      fontSubset: false,
      fill: { r: 0, g: 0, b: 0, a: 255 },
      renderMode: 3,
    });
    page.setRuns([run]);
    expect(adoptedTableModel(module, page, table).scanned).toBe(true);
    run.renderMode = 0;
    expect(adoptedTableModel(module, page, table).scanned).toBe(false);
  });
});
