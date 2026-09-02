import { describe, it, expect, beforeEach } from "vitest";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { InsertTableCommand } from "@app/tools/pdfTextEditor/commands/InsertTableCommand";
import { FillTableCellCommand } from "@app/tools/pdfTextEditor/commands/FillTableCellCommand";
import { ModifyTableCommand } from "@app/tools/pdfTextEditor/commands/ModifyTableCommand";
import { ResizeTableCommand } from "@app/tools/pdfTextEditor/commands/ResizeTableCommand";
import { HistoryStack } from "@app/tools/pdfTextEditor/store/HistoryStack";
import { redrawGrid } from "@app/tools/pdfTextEditor/commands/tableHelpers";

// A fake PDFium module that tracks which object pointers are live on the page,
// plus each object's kind, translation, and text. Enough to exercise the table
// commands' object bookkeeping and reversibility without the wasm engine.
interface FakeObj {
  ptr: number;
  kind: "rect" | "text";
  dx: number;
  dy: number;
  /** Accumulated scale, so a background refit can be told from a move. */
  sx: number;
  sy: number;
  text: string;
  fill: [number, number, number, number];
  /** PDF text render mode; 3 (invisible) is what an OCR layer carries. */
  mode: number;
}

interface FakeDoc extends EditorDocument {
  _objs: Map<number, FakeObj>;
  _onPage: Set<number>;
  _order: number[];
}

function makeDoc(): { doc: FakeDoc; page: Page } {
  const page = new Page({ index: 0, pagePtr: 1, width: 612, height: 792 });
  page.loaded = true;
  const objs = new Map<number, FakeObj>();
  const onPage = new Set<number>();
  /** Page order, which index-based z-order calls need on top of the set. */
  const order: number[] = [];
  const heap = new Map<number, number>();
  let nextPtr = 100;
  let nextAddr = 8;

  const module = {
    FPDFPageObj_CreateNewRect: (x: number, y: number) => {
      const ptr = nextPtr++;
      objs.set(ptr, {
        ptr,
        kind: "rect",
        dx: x,
        dy: y,
        sx: 1,
        sy: 1,
        text: "",
        fill: [0, 0, 0, 255],
        mode: 0,
      });
      return ptr;
    },
    FPDFPageObj_NewTextObj: () => {
      const ptr = nextPtr++;
      objs.set(ptr, {
        ptr,
        kind: "text",
        dx: 0,
        dy: 0,
        sx: 1,
        sy: 1,
        text: "",
        fill: [0, 0, 0, 255],
        mode: 0,
      });
      return ptr;
    },
    FPDFText_SetText: (ptr: number) => {
      const o = objs.get(ptr);
      if (o) o.text = "set";
      return true;
    },
    FPDFPageObj_SetFillColor: (
      ptr: number,
      r: number,
      g: number,
      b: number,
      a: number,
    ) => {
      const o = objs.get(ptr);
      if (o) o.fill = [r, g, b, a];
      return true;
    },
    FPDFPageObj_GetFillColor: (
      ptr: number,
      r: number,
      g: number,
      b: number,
      a: number,
    ) => {
      const o = objs.get(ptr);
      if (!o) return false;
      heap.set(r, o.fill[0]);
      heap.set(g, o.fill[1]);
      heap.set(b, o.fill[2]);
      heap.set(a, o.fill[3]);
      return true;
    },
    FPDFTextObj_GetTextRenderMode: (ptr: number) => objs.get(ptr)?.mode ?? 0,
    FPDFTextObj_SetTextRenderMode: (ptr: number, mode: number) => {
      const o = objs.get(ptr);
      if (o) o.mode = mode;
      return true;
    },
    FPDFPageObj_GetType: (ptr: number) =>
      objs.get(ptr)?.kind === "text" ? 1 : 2,
    FPDFPage_CountObjects: () => order.length,
    FPDFPage_GetObject: (_p: number, i: number) => order[i] ?? 0,
    FPDFPage_InsertObjectAtIndex: (_p: number, ptr: number, i: number) => {
      onPage.add(ptr);
      order.splice(Math.min(Math.max(i, 0), order.length), 0, ptr);
      return true;
    },
    // No wasm heap behind the out-params here, so report "cannot measure" and
    // let the caller fall back - the same path a build without the accessor
    // takes.
    FPDFPageObj_GetBounds: () => false,
    FPDFPath_SetDrawMode: () => true,
    FPDFPageObj_Transform: (
      ptr: number,
      a: number,
      _b: number,
      _c: number,
      d: number,
      e: number,
      f: number,
    ) => {
      const o = objs.get(ptr);
      if (o) {
        o.dx += e;
        o.dy += f;
        o.sx *= a;
        o.sy *= d;
      }
    },
    FPDFPage_InsertObject: (_p: number, ptr: number) => {
      onPage.add(ptr);
      order.push(ptr);
    },
    FPDFPage_RemoveObject: (_p: number, ptr: number) => {
      onPage.delete(ptr);
      const at = order.indexOf(ptr);
      if (at >= 0) order.splice(at, 1);
      return true;
    },
    pdfium: {
      // A tiny heap, so the out-param accessors can actually round-trip.
      wasmExports: {
        malloc: () => {
          const at = nextAddr;
          nextAddr += 4;
          return at;
        },
        free: () => {},
      },
      getValue: (addr: number) => heap.get(addr) ?? 0,
      stringToUTF16: () => {},
    },
  };

  const doc = {
    module,
    docPtr: 1,
    _objs: objs,
    _onPage: onPage,
    _order: order,
    page: () => page,
    loadedPages: () => [page],
  } as unknown as FakeDoc;
  return { doc, page };
}

function liveRects(doc: FakeDoc): number {
  let n = 0;
  for (const ptr of doc._onPage) {
    if (doc._objs.get(ptr)?.kind === "rect") n++;
  }
  return n;
}

describe("table commands (fake PDFium)", () => {
  let doc: FakeDoc;
  let page: Page;

  beforeEach(() => {
    ({ doc, page } = makeDoc());
  });

  it("inserts a 3x3 table with a full ruling grid, and reverts cleanly", () => {
    const cmd = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    cmd.apply(doc);

    expect(page.tables).toHaveLength(1);
    const model = page.tables[0];
    expect(model.rows).toBe(3);
    expect(model.cols).toBe(3);
    // (rows+1) horizontal + (cols+1) vertical ruling lines.
    expect(liveRects(doc)).toBe(4 + 4);
    expect(model.cellRuns.flat().every((c) => c === null)).toBe(true);

    cmd.revert(doc);
    expect(page.tables).toHaveLength(0);
    expect(liveRects(doc)).toBe(0);
  });

  it("fills an empty cell and links a run, reversibly", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;

    const fill = new FillTableCellCommand({
      tableId,
      row: 1,
      col: 2,
      text: "Hi",
    });
    fill.apply(doc);
    expect(page.runs).toHaveLength(1);
    expect(page.tables[0].cellRuns[1][2]).toBe(page.runs[0].id);

    fill.revert(doc);
    expect(page.runs).toHaveLength(0);
    expect(page.tables[0].cellRuns[1][2]).toBeNull();
  });

  it("adds a row, shifting lower cell content down, and reverts", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    // Content in the last row.
    new FillTableCellCommand({ tableId, row: 2, col: 0, text: "X" }).apply(doc);
    const run = page.runs[0];
    const yBefore = run.matrix.f;

    // Insert a row at the top: the content row moves down by one row height.
    const rowH = 90 / 3;
    const add = new ModifyTableCommand({ tableId, op: "add-row", index: 0 });
    add.apply(doc);
    expect(page.tables[0].rows).toBe(4);
    expect(run.matrix.f).toBeCloseTo(yBefore - rowH, 5);

    add.revert(doc);
    expect(page.tables[0].rows).toBe(3);
    expect(run.matrix.f).toBeCloseTo(yBefore, 5);
  });

  it("adds a column, shifting right-hand content, and reverts", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 2,
      cols: 2,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 0, col: 1, text: "R" }).apply(doc);
    const run = page.runs[0];
    const xBefore = run.matrix.e;

    const colW = 300 / 2;
    const add = new ModifyTableCommand({ tableId, op: "add-col", index: 0 });
    add.apply(doc);
    expect(page.tables[0].cols).toBe(3);
    expect(run.matrix.e).toBeCloseTo(xBefore + colW, 5);

    add.revert(doc);
    expect(page.tables[0].cols).toBe(2);
    expect(run.matrix.e).toBeCloseTo(xBefore, 5);
  });

  it("deletes a row with content and restores it on revert", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 1, col: 0, text: "M" }).apply(doc);
    expect(page.runs).toHaveLength(1);

    const del = new ModifyTableCommand({ tableId, op: "delete-row", index: 1 });
    del.apply(doc);
    expect(page.tables[0].rows).toBe(2);
    expect(page.runs).toHaveLength(0); // the row's run was removed

    del.revert(doc);
    expect(page.tables[0].rows).toBe(3);
    // Content re-emitted and relinked (fresh run id).
    expect(page.runs).toHaveLength(1);
    expect(page.tables[0].cellRuns[1][0]).toBe(page.runs[0].id);
  });

  it("round-trips through the history stack (insert, fill, add-row)", () => {
    const history = new HistoryStack();
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 2,
      cols: 2,
    });
    history.execute(insert, doc);
    const tableId = insert.insertedTableId!;
    history.execute(
      new FillTableCellCommand({ tableId, row: 0, col: 0, text: "A" }),
      doc,
    );
    history.execute(
      new ModifyTableCommand({ tableId, op: "add-row", index: 2 }),
      doc,
    );
    expect(page.tables[0].rows).toBe(3);
    expect(page.runs).toHaveLength(1);

    history.undo(doc); // undo add-row
    history.undo(doc); // undo fill
    history.undo(doc); // undo insert
    expect(page.tables).toHaveLength(0);
    expect(page.runs).toHaveLength(0);
    expect(liveRects(doc)).toBe(0);

    history.redo(doc); // redo insert
    history.redo(doc); // redo fill
    history.redo(doc); // redo add-row
    expect(page.tables).toHaveLength(1);
    expect(page.tables[0].rows).toBe(3);
    expect(page.runs).toHaveLength(1);
  });

  it("drags a column edge, carrying that column's text with it", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    // Column 1 spans 200..300; its text sits a padding inset inside that.
    new FillTableCellCommand({ tableId, row: 0, col: 1, text: "B" }).apply(doc);
    const runId = page.tables[0].cellRuns[0][1]!;
    const before = page.findRun(runId)!.bounds.x;

    const resize = new ResizeTableCommand({
      tableId,
      edit: { kind: "col-edge", index: 1, x: 240 },
    });
    resize.apply(doc);

    expect(page.tables[0].colEdges).toEqual([100, 240, 300, 400]);
    // Cell 1 now starts 40pt further right, and so does its text.
    expect(page.findRun(runId)!.bounds.x).toBeCloseTo(before + 40, 5);
    // The grid is still one line per edge, no leaks.
    expect(liveRects(doc)).toBe(4 + 4);

    resize.revert(doc);
    expect(page.tables[0].colEdges).toEqual([100, 200, 300, 400]);
    expect(page.findRun(runId)!.bounds.x).toBeCloseTo(before, 5);
    expect(liveRects(doc)).toBe(4 + 4);
  });

  it("drags a row edge, carrying that row's text with it", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    // Row 1 spans y 670..640; shrinking it from the top lifts its content.
    new FillTableCellCommand({ tableId, row: 1, col: 0, text: "B" }).apply(doc);
    const runId = page.tables[0].cellRuns[1][0]!;
    const before = page.findRun(runId)!.bounds.y;

    const resize = new ResizeTableCommand({
      tableId,
      edit: { kind: "row-edge", index: 2, y: 650 },
    });
    resize.apply(doc);

    expect(page.tables[0].rowEdges).toEqual([700, 670, 650, 610]);
    // Row 1's bottom moved up 10pt, so its text goes with it.
    expect(page.findRun(runId)!.bounds.y).toBeCloseTo(before + 10, 5);

    resize.revert(doc);
    expect(page.tables[0].rowEdges).toEqual([700, 670, 640, 610]);
    expect(page.findRun(runId)!.bounds.y).toBeCloseTo(before, 5);
  });

  it("scales the whole table and undoes back to the original geometry", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 2, col: 2, text: "C" }).apply(doc);
    const runId = page.tables[0].cellRuns[2][2]!;
    const run = page.findRun(runId)!;
    const before = { x: run.bounds.x, y: run.bounds.y };

    const history = new HistoryStack();
    const resize = new ResizeTableCommand({
      tableId,
      edit: { kind: "scale", width: 600, height: 180 },
    });
    history.execute(resize, doc);

    expect(page.tables[0].colEdges).toEqual([100, 300, 500, 700]);
    expect(page.tables[0].rowEdges).toEqual([700, 640, 580, 520]);
    // The bottom-right cell moved out with its corner.
    expect(page.findRun(runId)!.bounds.x).toBeGreaterThan(before.x);
    expect(page.findRun(runId)!.bounds.y).toBeLessThan(before.y);

    history.undo(doc);
    expect(page.tables[0].colEdges).toEqual([100, 200, 300, 400]);
    expect(page.tables[0].rowEdges).toEqual([700, 670, 640, 610]);
    expect(page.findRun(runId)!.bounds.x).toBeCloseTo(before.x, 5);
    expect(page.findRun(runId)!.bounds.y).toBeCloseTo(before.y, 5);
    expect(liveRects(doc)).toBe(4 + 4);
  });

  it("stretches an adopted row background when the table widens", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const model = page.tables[0];

    // A header shading box covering row 0, as adoption would have bound it.
    const fillPtr = doc.module.FPDFPageObj_CreateNewRect(100, 670, 300, 30);
    model.rowFills = [
      {
        row: 0,
        ptr: fillPtr,
        rect: { x: 100, y: 670, width: 300, height: 30 },
        color: { r: 200, g: 205, b: 215, a: 255 },
      },
    ];

    new ModifyTableCommand({
      tableId: model.id,
      op: "add-col",
      index: 3,
    }).apply(doc);

    // The table is now 400 wide, and the background covers all of it.
    expect(model.colEdges[model.cols] - model.colEdges[0]).toBeCloseTo(400, 5);
    expect(model.rowFills[0].rect.width).toBeCloseTo(400, 5);
    expect(model.rowFills[0].rect.x).toBeCloseTo(100, 5);
    // Widened by transform, not redrawn - that is what keeps it behind the text.
    expect(doc._objs.get(fillPtr)!.sx).toBeCloseTo(400 / 300, 5);
    expect(doc._objs.get(fillPtr)!.sy).toBeCloseTo(1, 5);
  });

  it("leaves a row background alone when the geometry does not move", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const model = page.tables[0];
    const fillPtr = doc.module.FPDFPageObj_CreateNewRect(100, 670, 300, 30);
    model.rowFills = [
      {
        row: 0,
        ptr: fillPtr,
        rect: { x: 100, y: 670, width: 300, height: 30 },
        color: { r: 200, g: 205, b: 215, a: 255 },
      },
    ];
    const before = { ...doc._objs.get(fillPtr)! };

    redrawGrid(doc, page, model);

    expect(doc._objs.get(fillPtr)!.sx).toBe(before.sx);
    expect(doc._objs.get(fillPtr)!.dx).toBe(before.dx);
  });

  it("scales the cell text with the frame, and undo puts the size back", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 1, col: 1, text: "Hi" }).apply(
      doc,
    );
    const model = page.tables[0];
    const runId = model.cellRuns[1][1]!;
    const sizeBefore = page.findRun(runId)!.fontSize;
    const colSizeBefore = model.columnStyles[1].fontSize;

    const history = new HistoryStack();
    // Half the width, half the height: text has to come down with it or it
    // spills over the column beside it.
    history.execute(
      new ResizeTableCommand({
        tableId,
        edit: { kind: "scale", width: 150, height: 45 },
      }),
      doc,
    );

    expect(page.findRun(runId)!.fontSize).toBeCloseTo(sizeBefore / 2, 5);
    // New cells typed after the resize match what is now in the table.
    expect(model.columnStyles[1].fontSize).toBeCloseTo(colSizeBefore / 2, 5);

    history.undo(doc);
    expect(page.findRun(runId)!.fontSize).toBeCloseTo(sizeBefore, 5);
    expect(model.columnStyles[1].fontSize).toBeCloseTo(colSizeBefore, 5);
    expect(model.colEdges).toEqual([100, 200, 300, 400]);
  });

  it("moves an edge without touching the text size", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 1, col: 1, text: "Hi" }).apply(
      doc,
    );
    const runId = page.tables[0].cellRuns[1][1]!;
    const sizeBefore = page.findRun(runId)!.fontSize;

    new ResizeTableCommand({
      tableId,
      edit: { kind: "col-edge", index: 1, x: 240 },
    }).apply(doc);

    // Only a whole-table scale resizes type; dragging one boundary must not.
    expect(page.findRun(runId)!.fontSize).toBe(sizeBefore);
  });

  it("keeps the text size stable across repeated grow/shrink cycles", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 1, col: 1, text: "Hi" }).apply(
      doc,
    );
    const runId = page.tables[0].cellRuns[1][1]!;
    const original = page.findRun(runId)!.fontSize;

    // Grow and shrink with DIFFERENT ratios per axis - the case where taking
    // the tighter axis per gesture used to ratchet the type down every cycle.
    for (let i = 0; i < 6; i++) {
      new ResizeTableCommand({
        tableId,
        edit: { kind: "scale", width: 450, height: 108 },
      }).apply(doc);
      new ResizeTableCommand({
        tableId,
        edit: { kind: "scale", width: 300, height: 90 },
      }).apply(doc);
    }

    expect(page.tables[0].colEdges).toEqual([100, 200, 300, 400]);
    expect(page.findRun(runId)!.fontSize).toBeCloseTo(original, 5);
  });

  it("does not resize text when a row is added and removed", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 0, col: 0, text: "A" }).apply(doc);
    const runId = page.tables[0].cellRuns[0][0]!;
    const original = page.findRun(runId)!.fontSize;

    // Structural edits change the table's extent; the font reference has to
    // follow, or the next scale would try to correct for them.
    new ModifyTableCommand({ tableId, op: "add-row", index: 3 }).apply(doc);
    new ModifyTableCommand({ tableId, op: "add-col", index: 3 }).apply(doc);
    new ResizeTableCommand({
      tableId,
      edit: { kind: "scale", width: 400, height: 120 },
    }).apply(doc);
    new ResizeTableCommand({
      tableId,
      edit: {
        kind: "scale",
        width: page.tables[0].fontBase.width,
        height: page.tables[0].fontBase.height,
      },
    }).apply(doc);

    expect(page.findRun(runId)!.fontSize).toBeCloseTo(original, 5);
  });

  it("moves the whole table, carrying its text and background, reversibly", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 1, col: 1, text: "Hi" }).apply(
      doc,
    );
    const model = page.tables[0];
    const runId = model.cellRuns[1][1]!;
    const fillPtr = doc.module.FPDFPageObj_CreateNewRect(100, 670, 300, 30);
    model.rowFills = [
      {
        row: 0,
        ptr: fillPtr,
        rect: { x: 100, y: 670, width: 300, height: 30 },
        color: { r: 200, g: 205, b: 215, a: 255 },
      },
    ];
    const before = {
      cols: [...model.colEdges],
      rows: [...model.rowEdges],
      runX: page.findRun(runId)!.matrix.e,
      runY: page.findRun(runId)!.matrix.f,
      size: page.findRun(runId)!.fontSize,
    };

    const move = new ResizeTableCommand({
      tableId,
      edit: { kind: "move", dx: 40, dy: -25 },
    });
    move.apply(doc);

    expect(model.colEdges).toEqual(before.cols.map((x) => x + 40));
    expect(model.rowEdges).toEqual(before.rows.map((y) => y - 25));
    // Text travels with the grid, at the same size - a move is not a resize.
    expect(page.findRun(runId)!.matrix.e).toBeCloseTo(before.runX + 40, 5);
    expect(page.findRun(runId)!.matrix.f).toBeCloseTo(before.runY - 25, 5);
    expect(page.findRun(runId)!.fontSize).toBe(before.size);
    // And so does the row background.
    expect(model.rowFills[0].rect.x).toBeCloseTo(140, 5);

    move.revert(doc);
    expect(model.colEdges).toEqual(before.cols);
    expect(model.rowEdges).toEqual(before.rows);
    expect(page.findRun(runId)!.matrix.e).toBeCloseTo(before.runX, 5);
    expect(page.findRun(runId)!.matrix.f).toBeCloseTo(before.runY, 5);
  });

  it("keeps merged cells when the editor redraws the grid", () => {
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const model = page.tables[0];
    // Row 0 merges columns 0-1, as an adopted table would record it.
    model.cellSpans[0][0] = { rowSpan: 1, colSpan: 2 };

    // A covered position is not a cell of its own, and the anchor's rect
    // reaches across the merge.
    expect(model.isCovered(0, 1)).toBe(true);
    expect(model.isCovered(1, 1)).toBe(false);
    expect(model.cellRect(0, 0).width).toBeCloseTo(200, 5);
    const snap = model.snapshot();
    expect(snap.cells.filter((c) => c.row === 0)).toHaveLength(2);
    expect(snap.cells.find((c) => c.row === 0 && c.col === 0)?.colSpan).toBe(2);

    // Redrawing must not paint a boundary through the merge. A plain grid
    // would emit 4 horizontals + 4 verticals; here the vertical between
    // columns 0 and 1 is drawn for 2 of the 3 rows, so it arrives as one
    // shorter segment instead of a full-height line.
    const before = liveRects(doc);
    redrawGrid(doc, page, model);
    expect(liveRects(doc)).toBe(before);
    new ModifyTableCommand({
      tableId: model.id,
      op: "add-row",
      index: 3,
    }).apply(doc);
    // The merge survives a structural edit.
    expect(model.cellSpans[0][0]).toEqual({ rowSpan: 1, colSpan: 2 });
    expect(model.isCovered(0, 1)).toBe(true);
  });

  it("moves every object a run is built from, not just the first", () => {
    // A paragraph run groups several text objects. Moving only the
    // representative strands the rest - the "Q1 Sales" / "North America"
    // fragments left behind when a scanned table was dragged.
    const insert = new InsertTableCommand({
      pageIndex: 0,
      x: 100,
      y: 700,
      width: 300,
      height: 90,
      rows: 3,
      cols: 3,
    });
    insert.apply(doc);
    const tableId = insert.insertedTableId!;
    new FillTableCellCommand({ tableId, row: 1, col: 1, text: "Hi" }).apply(
      doc,
    );
    const model = page.tables[0];
    const run = page.findRun(model.cellRuns[1][1]!)!;
    // A second text object belonging to the same run, as grouping produces.
    const extraPtr = doc.module.FPDFPageObj_NewTextObj(1, "Helvetica", 10);
    run.paragraphLeafPtrs = [run.pdfiumObjPtr, extraPtr];
    const before = doc._objs.get(extraPtr)!.dx;

    new ResizeTableCommand({
      tableId,
      edit: { kind: "move", dx: 30, dy: -20 },
    }).apply(doc);

    expect(doc._objs.get(extraPtr)!.dx).toBeCloseTo(before + 30, 5);
    expect(doc._objs.get(extraPtr)!.dy).toBeCloseTo(-20, 5);
  });
});
