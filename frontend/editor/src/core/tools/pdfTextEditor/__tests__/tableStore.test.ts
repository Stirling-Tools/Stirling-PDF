import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import * as detection from "@app/tools/pdfTextEditor/util/tableDetection";

async function makeStore() {
  const page = new Page({ index: 0, pagePtr: 1, width: 612, height: 792 });
  page.loaded = true;
  const model = new TableModel({
    id: "p0-table-0-editable",
    pageIndex: 0,
    colEdges: [100, 200, 300],
    rowEdges: [700, 670, 640],
    cellRuns: [
      [null, null],
      [null, null],
    ],
    hLinePtrs: [],
    vLinePtrs: [],
    lineWidth: 1,
    fontSize: 11,
    adopted: true,
  });
  page.tables = [model];
  const doc = {
    pageCount: 1,
    page: () => page,
    loadedPages: () => [page],
    module: {},
    dispose: () => {},
  } as unknown as EditorDocument;
  const store = new EditorStore();
  await store.setDocument(doc);
  store.publishPages([
    {
      pageIndex: 0,
      width: page.width,
      height: page.height,
      dirty: false,
      revision: page.revision,
      runs: [],
      images: [],
      shapes: [],
      tables: [model.snapshot()],
      rules: [],
      display: page.display.toData(),
    },
  ]);
  return { store, page, model };
}

afterEach(() => vi.restoreAllMocks());

describe("table session lifecycle", () => {
  it("keeps released models when a detected positional id names another table", async () => {
    const { store, page, model } = await makeStore();
    store.releaseTable(0, model.id);
    const other = new TableModel({
      id: "p0-table-0",
      pageIndex: 0,
      colEdges: [350, 400, 450],
      rowEdges: [500, 470, 440],
      cellRuns: [
        [null, null],
        [null, null],
      ],
      hLinePtrs: [],
      vLinePtrs: [],
      lineWidth: 1,
      fontSize: 11,
    });
    store.adoptTable(other.snapshot());
    expect(page.tables).toHaveLength(2);
    expect(page.tables[0]).toBe(model);
    expect(model.editing).toBe(false);
    expect(page.tables[1].id).toBe("p0-table-0-2-editable");
    expect(page.tables[1].snapshot().bounds).toEqual(other.snapshot().bounds);
    expect(store.getState().dirty).toBe(false);
    store.dispose();
  });

  it.each([true, false])(
    "keeps split runs and adoption synchronized through history (detected: %s)",
    async (detected) => {
      const { store, page, model } = await makeStore();
      page.tables = [];
      const run = new TextRun({
        id: "column",
        pageIndex: 0,
        pdfiumObjPtr: 0,
        text: "First\nSecond",
        fontId: "Helvetica",
        fontSize: 11,
        fontSubset: false,
        fill: { r: 0, g: 0, b: 0, a: 255 },
        bounds: { x: 110, y: 650, width: 40, height: 45 },
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 110, f: 690 },
        renderMode: 3,
      });
      run.paragraphMemberPtrs = [0, 0];
      run.paragraphMemberFs = [690, 660];
      page.setRuns([run]);
      const table = {
        ...model.snapshot(),
        id: "p0-table-0",
        cells: [
          {
            row: 0,
            col: 0,
            rowSpan: 1,
            colSpan: 1,
            runIds: [run.id],
            rect: run.bounds,
          },
        ],
      };
      vi.spyOn(detection, "detectTables").mockImplementation(() =>
        detected
          ? [
              {
                ...table,
                cells: page.runs.map((r, row) => ({
                  row,
                  col: 0,
                  rowSpan: 1,
                  colSpan: 1,
                  runIds: [r.id],
                  rect: r.bounds,
                })),
              },
            ]
          : [],
      );
      store.adoptTable(table);
      if (!detected) {
        expect(page.tables).toEqual([]);
        expect(page.runs).toEqual([run]);
        expect(run.text).toBe("First\nSecond");
        expect(store.getState().dirty).toBe(false);
      } else {
        expect(page.tables[0].cellRuns[1][0]).toBe(page.runs[1].id);
        expect(page.runs[1].renderMode).toBe(3);
        store.undo();
        expect(page.tables).toEqual([]);
        expect(page.runs).toEqual([run]);
        expect(run.text).toBe("First\nSecond");
        expect(store.getState().dirty).toBe(false);
        store.redo();
        expect(page.tables).toHaveLength(1);
        expect(page.tables[0].cellRuns[1][0]).toBe(page.runs[1].id);
      }
      store.dispose();
    },
  );
  it("hides a released grid while keeping it available to undo and re-adoption", async () => {
    const { store, page, model } = await makeStore();
    store.releaseTable(0, model.id);
    expect(store.getState().pages[0].tables).toEqual([]);
    expect(page.tables[0]).toBe(model);
    expect(store.getState().dirty).toBe(false);
    store.adoptTable({ ...model.snapshot(), id: "p0-table-0" });
    expect(store.getState().pages[0].tables).toHaveLength(1);
    expect(page.tables).toHaveLength(1);
    store.dispose();
  });

  it("drops stale cell mappings and publishes fresh rules after regrouping", async () => {
    const { store, page } = await makeStore();
    vi.spyOn(PdfiumTextReader, "populate").mockImplementation(
      (_doc, target) => {
        target.setRules([
          {
            x: 100,
            y: 700,
            width: 200,
            height: 1,
            ptr: 42,
            thickness: 1,
            color: { r: 0, g: 0, b: 0, a: 255 },
          },
        ]);
        target.loaded = true;
      },
    );
    store.setGroupingMode("line");
    expect(page.tables).toEqual([]);
    expect(store.getState().pages[0].tables).toEqual([]);
    expect(store.getState().pages[0].rules?.[0].ptr).toBe(42);
    store.dispose();
  });
});
