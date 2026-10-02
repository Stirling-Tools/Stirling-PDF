import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";

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
      tables: [model.snapshot()],
      rules: [],
      display: page.display.toData(),
    },
  ]);
  return { store, page, model };
}

afterEach(() => vi.restoreAllMocks());

describe("table session lifecycle", () => {
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
