import { describe, it, expect, beforeEach } from "vitest";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { MaterialiseTableCommand } from "@app/tools/pdfTextEditor/commands/MaterialiseTableCommand";
import type { ScanColors } from "@app/tools/pdfTextEditor/util/scanSampling";

// A fake PDFium that can MEASURE. The table-command fake reports "cannot
// measure" so its callers take the fallback path; a rebuild has to fit emitted
// text onto a measured box, so that path is exactly what needs covering here.
interface FakeObj {
  ptr: number;
  kind: "rect" | "text" | "form";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: [number, number, number, number];
}

interface FakeDoc extends EditorDocument {
  _objs: Map<number, FakeObj>;
  _order: number[];
  /** What each form XObject actually holds, which is what decides removal. */
  _children: Map<number, number[]>;
}

/** Nominal glyph box the fake reports, per point of font size. */
const CHAR_W = 4;
const CAP_H = 0.72;

function makeDoc(): { doc: FakeDoc; page: Page } {
  const page = new Page({ index: 0, pagePtr: 1, width: 595, height: 842 });
  page.loaded = true;
  const objs = new Map<number, FakeObj>();
  const order: number[] = [];
  const children = new Map<number, number[]>();
  const heap = new Map<number, number>();
  let nextPtr = 100;
  let nextAddr = 8;

  const module = {
    FPDFPageObj_CreateNewRect: (x: number, y: number, w: number, h: number) => {
      const ptr = nextPtr++;
      objs.set(ptr, {
        ptr,
        kind: "rect",
        x,
        y,
        w,
        h,
        fill: [0, 0, 0, 255],
      });
      return ptr;
    },
    FPDFPageObj_NewTextObj: (_d: number, _family: string, size: number) => {
      const ptr = nextPtr++;
      objs.set(ptr, {
        ptr,
        kind: "text",
        x: 0,
        y: 0,
        w: size * CHAR_W,
        h: size * CAP_H,
        fill: [0, 0, 0, 255],
      });
      return ptr;
    },
    FPDFText_SetText: () => true,
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
    FPDFPageObj_GetBounds: (
      ptr: number,
      l: number,
      b: number,
      r: number,
      t: number,
    ) => {
      const o = objs.get(ptr);
      if (!o) return false;
      heap.set(l, o.x);
      heap.set(b, o.y);
      heap.set(r, o.x + o.w);
      heap.set(t, o.y + o.h);
      return true;
    },
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
      if (!o) return;
      o.x = o.x * a + e;
      o.y = o.y * d + f;
      o.w *= a;
      o.h *= d;
    },
    FPDFPageObj_GetType: (ptr: number) => {
      const kind = objs.get(ptr)?.kind;
      return kind === "text" ? 1 : kind === "form" ? 5 : 2;
    },
    FPDFPage_CountObjects: () => order.length,
    FPDFPage_GetObject: (_p: number, i: number) => order[i] ?? 0,
    FPDFPage_InsertObject: (_p: number, ptr: number) => {
      order.push(ptr);
    },
    FPDFPage_InsertObjectAtIndex: (_p: number, ptr: number, i: number) => {
      order.splice(Math.min(Math.max(i, 0), order.length), 0, ptr);
      return true;
    },
    FPDFFormObj_CountObjects: (form: number) => children.get(form)?.length ?? 0,
    FPDFFormObj_GetObject: (form: number, i: number) =>
      children.get(form)?.[i] ?? 0,
    FPDFPage_RemoveObject: (_p: number, ptr: number) => {
      const at = order.indexOf(ptr);
      if (at >= 0) order.splice(at, 1);
      return true;
    },
    pdfium: {
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
    _order: order,
    _children: children,
    page: () => page,
    loadedPages: () => [page],
  } as unknown as FakeDoc;
  return { doc, page };
}

/** An invisible OCR word: a text object plus the run that points at it. */
function addOcrRun(
  doc: FakeDoc,
  page: Page,
  opts: {
    id: string;
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    size: number;
    container: number;
  },
): TextRun {
  const ptr = doc.module.FPDFPageObj_NewTextObj(1, "Helvetica", opts.size);
  const obj = doc._objs.get(ptr)!;
  obj.x = opts.x;
  obj.y = opts.y;
  obj.w = opts.w;
  obj.h = opts.h;
  doc._children.set(opts.container, [
    ...(doc._children.get(opts.container) ?? []),
    ptr,
  ]);
  const run = new TextRun({
    id: opts.id,
    pageIndex: 0,
    pdfiumObjPtr: ptr,
    bounds: { x: opts.x, y: opts.y, width: opts.w, height: opts.h },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: opts.x, f: opts.y },
    text: opts.text,
    fontId: "ocr",
    fontSize: opts.size,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: true,
    renderMode: 3,
    topLevelContainerPtr: opts.container,
  });
  page.setRuns([...page.runs, run]);
  return run;
}

const NAVY = { r: 31, g: 56, b: 100, a: 255 };
const PAPER = { r: 250, g: 249, b: 246, a: 255 };
const WHITE_INK = { r: 255, g: 255, b: 255, a: 255 };
const BLACK_INK = { r: 10, g: 10, b: 10, a: 255 };
const FORM = 9001;

function scanColors(): ScanColors {
  const cells = Array.from({ length: 2 }, (_, r) =>
    Array.from({ length: 2 }, () =>
      r === 0 ? { bg: NAVY, ink: WHITE_INK } : { bg: PAPER, ink: BLACK_INK },
    ),
  );
  return { cells, paper: PAPER, rule: { r: 20, g: 20, b: 20, a: 255 } };
}

describe("MaterialiseTableCommand (measurable fake PDFium)", () => {
  let doc: FakeDoc;
  let page: Page;
  let model: TableModel;

  beforeEach(() => {
    ({ doc, page } = makeDoc());
    // The OCR layer is ONE form object on the page; its words are inside it,
    // which is the whole reason editing them does not survive a save.
    doc._objs.set(FORM, {
      ptr: FORM,
      kind: "form",
      x: 90,
      y: 640,
      w: 200,
      h: 60,
      fill: [0, 0, 0, 0],
    });
    doc._order.push(FORM);
    // Two rows of two cells, each holding one invisible OCR word. The word
    // boxes deliberately disagree with their declared font sizes, the way
    // tesseract's do.
    addOcrRun(doc, page, {
      id: "ocr-h1",
      text: "Region",
      x: 100,
      y: 690,
      w: 30,
      h: 7.2,
      size: 9.5,
      container: FORM,
    });
    addOcrRun(doc, page, {
      id: "ocr-h2",
      text: "Sales",
      x: 200,
      y: 690,
      w: 26,
      h: 7.2,
      size: 10.4,
      container: FORM,
    });
    addOcrRun(doc, page, {
      id: "ocr-b1",
      text: "North America",
      x: 100,
      y: 660,
      w: 59,
      h: 5.8,
      size: 8.05,
      container: FORM,
    });
    addOcrRun(doc, page, {
      id: "ocr-b2",
      text: "1,204,000",
      x: 200,
      y: 660,
      w: 40,
      h: 6.3,
      size: 9.08,
      container: FORM,
    });
    model = new TableModel({
      id: "p0-table-0-editable",
      pageIndex: 0,
      colEdges: [90, 190, 290],
      rowEdges: [700, 670, 640],
      cellRuns: [
        ["ocr-h1", "ocr-h2"],
        ["ocr-b1", "ocr-b2"],
      ],
      hLinePtrs: [],
      vLinePtrs: [],
      lineWidth: 0.75,
      fontSize: 9,
      ruled: false,
      adopted: true,
      scanned: true,
    });
    page.tables.push(model);
  });

  const textObjs = (): FakeObj[] =>
    doc._order.map((p) => doc._objs.get(p)!).filter((o) => o.kind === "text");

  it("replaces OCR text with page-level objects, since form edits are lost on save", () => {
    const before = textObjs().map((o) => o.ptr);
    new MaterialiseTableCommand({
      tableId: model.id,
      colors: scanColors(),
    }).apply(doc);

    // The originals are gone from the page and the model, replaced by new ones.
    const after = textObjs().map((o) => o.ptr);
    expect(after.some((p) => before.includes(p))).toBe(false);
    expect(after).toHaveLength(4);
    expect(
      model.cellRuns.flat().every((id) => id && !id.startsWith("ocr-")),
    ).toBe(true);
    expect(page.runs.some((r) => r.id.startsWith("ocr-"))).toBe(false);
    // The form held nothing but this table, so it goes too.
    expect(doc._order).not.toContain(FORM);
  });

  it("fits each replacement onto the box the scanned word occupied", () => {
    new MaterialiseTableCommand({
      tableId: model.id,
      colors: scanColors(),
    }).apply(doc);

    const placed = textObjs();
    // "North America": declared 8.05pt but 59pt wide - the box wins, so the
    // replacement lands on the same 59 x 5.8 rectangle.
    const wide = placed.find((o) => Math.round(o.w) === 59);
    expect(wide).toBeDefined();
    expect(wide!.x).toBeCloseTo(100, 1);
    expect(wide!.y).toBeCloseTo(660, 1);
    expect(wide!.h).toBeCloseTo(5.8, 1);
    // Every replacement matches its original box, not its original font size.
    const boxes = placed.map((o) =>
      [o.w, o.h].map((v) => Math.round(v * 10) / 10),
    );
    expect(boxes).toContainEqual([30, 7.2]);
    expect(boxes).toContainEqual([26, 7.2]);
    expect(boxes).toContainEqual([40, 6.3]);
  });

  it("keeps a form that holds text the table did not claim", () => {
    addOcrRun(doc, page, {
      id: "ocr-heading",
      text: "Regional performance",
      x: 100,
      y: 750,
      w: 120,
      h: 9,
      size: 14,
      container: FORM,
    });
    new MaterialiseTableCommand({
      tableId: model.id,
      colors: scanColors(),
    }).apply(doc);

    // Dropping the form would take the heading's only text layer with it.
    expect(doc._order).toContain(FORM);
    expect(page.runs.some((r) => r.id === "ocr-heading")).toBe(true);
  });

  it("gives each cell the ink it was scanned with, and reverts completely", () => {
    const cmd = new MaterialiseTableCommand({
      tableId: model.id,
      colors: scanColors(),
    });
    cmd.apply(doc);

    // White-on-navy would vanish if the rebuild forced everything to black.
    const inks = textObjs().map((o) => o.fill.join(","));
    expect(inks.filter((f) => f === "255,255,255,255")).toHaveLength(2);
    expect(inks.filter((f) => f === "10,10,10,255")).toHaveLength(2);
    // The navy header is a row fill, so a later move carries it along.
    expect(model.rowFills).toHaveLength(1);
    expect(model.rowFills[0].color).toEqual(NAVY);

    cmd.revert(doc);
    expect(model.ruled).toBe(false);
    expect(model.rowFills).toHaveLength(0);
    expect(model.cellRuns[0][0]).toBe("ocr-h1");
    expect(page.runs.map((r) => r.id).sort()).toEqual([
      "ocr-b1",
      "ocr-b2",
      "ocr-h1",
      "ocr-h2",
    ]);
    expect(doc._order).toContain(FORM);
    expect(textObjs()).toHaveLength(0);
    expect(
      doc._order.filter((p) => doc._objs.get(p)?.kind === "rect"),
    ).toHaveLength(0);
  });

  it("keeps a form that also holds a non-text object, so nothing else is lost", () => {
    // A logo sealed in the same form as the table's OCR text. Counting only
    // the runs would call this form spent and delete the logo with it.
    const logo = 8100;
    doc._objs.set(logo, {
      ptr: logo,
      kind: "rect",
      x: 100,
      y: 700,
      w: 20,
      h: 20,
      fill: [0, 0, 0, 255],
    });
    doc._children.set(FORM, [...(doc._children.get(FORM) ?? []), logo]);

    new MaterialiseTableCommand({
      tableId: model.id,
      colors: scanColors(),
    }).apply(doc);

    expect(doc._order).toContain(FORM);
    expect(doc._children.get(FORM)).toContain(logo);
  });
});
