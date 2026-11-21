// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { AlignParagraphLinesCommand } from "@editor/tools/pdfTextEditor/commands/AlignParagraphLinesCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { MergeRunsCommand } from "@editor/tools/pdfTextEditor/commands/MergeRunsCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import { UngroupParagraphCommand } from "@editor/tools/pdfTextEditor/commands/UngroupParagraphCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rtl-mixed-sample.pdf",
);
const READ_ONLY = "ISO 50001 هو المعيار";
const ENGLISH =
  "An English line quoting مرحبا بالعالم and שלום עולם then 1,234.";
const HEBREW =
  "הטלפון הוא 03-555-1234 (שלוחה 12), והמחיר 1,299.90 לפי Open Source סעיף 4.";
const RED = { r: 255, g: 0, b: 0, a: 255 };

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith(".wasm")
        ? new Response(wasm, {
            headers: { "Content-Type": "application/wasm" },
          })
        : new Response(null, { status: 404 }),
    ),
  );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

const lineOf = (doc: EditorDocument, text: string): TextRun =>
  doc.page(0).runs.find((run) => run.text === text)!;

// Every object the page draws, in content order, with where and how it is drawn.
function pageObjects(doc: EditorDocument): string[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const buf = m.pdfium.wasmExports.malloc(24);
  const drawn: string[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      m.FPDFPageObj_GetMatrix(obj, buf);
      const matrix = [0, 4, 8, 12, 16, 20].map((at) =>
        m.pdfium.getValue(buf + at, "float").toFixed(3),
      );
      m.FPDFPageObj_GetFillColor(obj, buf, buf + 4, buf + 8, buf + 12);
      const fill = [0, 4, 8, 12].map((at) =>
        m.pdfium.getValue(buf + at, "i32"),
      );
      m.FPDFPageObj_GetStrokeColor(obj, buf, buf + 4, buf + 8, buf + 12);
      const stroke = [0, 4, 8, 12].map((at) =>
        m.pdfium.getValue(buf + at, "i32"),
      );
      drawn.push(`${obj} ${matrix} fill ${fill} stroke ${stroke}`);
    }
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
  return drawn;
}

const model = (doc: EditorDocument) =>
  doc.page(0).runs.map((run) => run.snapshot());

type Build = (run: TextRun, doc: EditorDocument) => Command;

const REDRAWS: Array<[string, Build]> = [
  [
    "a font family",
    (run) =>
      new SetFontFamilyCommand({
        pageIndex: 0,
        runId: run.id,
        nextFamily: "Times-Roman",
      }),
  ],
  [
    "a font size",
    (run) =>
      new SetFontSizeCommand({ pageIndex: 0, runId: run.id, nextSize: 14 }),
  ],
  [
    "a duplicate",
    (run) => new DuplicateRunCommand({ pageIndex: 0, runId: run.id }),
  ],
  [
    "an outline",
    (run) =>
      new SetTextOutlineCommand({
        pageIndex: 0,
        runId: run.id,
        stroke: RED,
        width: 1,
      }),
  ],
  [
    "a wrap width",
    (run) =>
      new ReflowWrapCommand({
        pageIndex: 0,
        runId: run.id,
        maxWidthPt: 60,
        explicit: true,
      }),
  ],
  [
    "a merge with another line",
    (run, doc) =>
      new MergeRunsCommand({
        pageIndex: 0,
        runIds: [lineOf(doc, ENGLISH).id, run.id],
      }),
  ],
  [
    "a batch holding a font size",
    (run, doc) =>
      new CompositeCommand([
        new SetFontSizeCommand({
          pageIndex: 0,
          runId: lineOf(doc, ENGLISH).id,
          nextSize: 14,
        }),
        new SetFontSizeCommand({ pageIndex: 0, runId: run.id, nextSize: 14 }),
      ]),
  ],
];

describe("a line the editor cannot redraw as it is drawn", () => {
  test.each(REDRAWS)("is left as it is by %s", async (_name, build) => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, READ_ONLY);
    expect(run.textReadOnly).toBe(true);
    const objects = pageObjects(doc);
    const runs = model(doc);

    expect(() => history.execute(build(run, doc), doc)).toThrow(
      expect.objectContaining({ documentIntact: true }),
    );

    expect(pageObjects(doc)).toEqual(objects);
    expect(model(doc)).toEqual(runs);
    expect(history.canUndo).toBe(false);
  });

  test("is refused a duplicate before any copy is drawn", async () => {
    const doc = await open();
    const run = lineOf(doc, READ_ONLY);
    const inserted = vi.spyOn(doc.module, "FPDFPage_InsertObject");

    expect(() =>
      new HistoryStack().execute(
        new DuplicateRunCommand({ pageIndex: 0, runId: run.id }),
        doc,
      ),
    ).toThrow(expect.objectContaining({ documentIntact: true }));

    expect(inserted).not.toHaveBeenCalled();
  });

  test("is left as it is by line alignment of the paragraph holding it", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const merge = new MergeRunsCommand({
      pageIndex: 0,
      runIds: [lineOf(doc, HEBREW).id, lineOf(doc, ENGLISH).id],
    });
    history.execute(merge, doc);
    const paragraph = doc.page(0).findRun(merge.representativeRunId!)!;
    paragraph.readingOrderUnsure = true;
    const objects = pageObjects(doc);
    const runs = model(doc);

    expect(() =>
      history.execute(
        new AlignParagraphLinesCommand({
          pageIndex: 0,
          runId: paragraph.id,
          mode: "right",
        }),
        doc,
      ),
    ).toThrow(expect.objectContaining({ documentIntact: true }));

    expect(pageObjects(doc)).toEqual(objects);
    expect(model(doc)).toEqual(runs);
    expect(history.size().undo).toBe(1);
  });

  test("stays read-only on every line its paragraph is split into", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const merge = new MergeRunsCommand({
      pageIndex: 0,
      runIds: [lineOf(doc, HEBREW).id, lineOf(doc, ENGLISH).id],
    });
    history.execute(merge, doc);
    const paragraph = doc.page(0).findRun(merge.representativeRunId!)!;
    paragraph.readingOrderUnsure = true;

    const split = new UngroupParagraphCommand({
      pageIndex: 0,
      runId: paragraph.id,
    });
    history.execute(split, doc);

    // The first line stays on the paragraph's own run.
    const lines = [
      paragraph,
      ...split.resultRunIds.slice(1).map((id) => doc.page(0).findRun(id)!),
    ];
    expect(lines.map((line) => line.text)).toEqual([HEBREW, ENGLISH]);
    expect(lines.map((line) => line.textReadOnly)).toEqual([true, true]);
  });

  test("can still be moved, recoloured and deleted, and each is undone", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, READ_ONLY);
    const objects = pageObjects(doc);
    const runs = model(doc);
    const x = run.bounds.x;

    history.execute(
      new MoveTextRunCommand({ pageIndex: 0, runId: run.id, dx: 20, dy: -5 }),
      doc,
    );
    expect(run.bounds.x).toBeCloseTo(x + 20);
    history.execute(
      new SetColourCommand({ pageIndex: 0, runId: run.id, nextFill: RED }),
      doc,
    );
    expect(run.fill).toEqual(RED);
    history.execute(
      new DeleteObjectCommand({ pageIndex: 0, runId: run.id }),
      doc,
    );
    expect(doc.page(0).findRun(run.id)).toBeUndefined();
    expect(pageObjects(doc).length).toBeLessThan(objects.length);

    while (history.canUndo) history.undo(doc);

    // An undone delete draws the line's objects last on the page, so only what is drawn is compared.
    expect(pageObjects(doc).sort()).toEqual([...objects].sort());
    expect(model(doc)).toEqual(runs);
  });
});
