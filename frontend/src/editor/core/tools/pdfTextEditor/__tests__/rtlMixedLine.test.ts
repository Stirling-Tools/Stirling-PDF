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
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { detectSaveRisks } from "@editor/tools/pdfTextEditor/util/documentRisks";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rtl-mixed-sample.pdf",
);
const ARABIC =
  "بلغ الاستهلاك (في الربع) 12,450.75 كيلوواط [بزيادة 3.5%] حسب تقرير ISO 50001";
const ARABIC_WITH_NAMES =
  "استخدم برنامج LibreOffice Writer أو Word لفتح report-2026.docx الآن.";
const HEBREW =
  "הטלפון הוא 03-555-1234 (שלוחה 12), והמחיר 1,299.90 לפי Open Source סעיף 4.";
const ENGLISH =
  "An English line quoting مرحبا بالعالم and שלום עולם then 1,234.";
const LATIN_FIRST = "ISO 50001 هو المعيار";
const FPDF_PAGEOBJ_TEXT = 1;

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

async function open(bytes?: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    bytes ?? new Uint8Array(await readFile(SAMPLE)),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

const texts = (doc: EditorDocument) => doc.page(0).runs.map((run) => run.text);

const lineOf = (doc: EditorDocument, text: string): TextRun =>
  doc.page(0).runs.find((run) => run.text === text)!;

// Where every text object on the page sits, by pointer.
function placements(doc: EditorDocument): Map<number, string> {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const matrix = m.pdfium.wasmExports.malloc(24);
  const placed = new Map<number, string>();
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFPageObj_GetMatrix(obj, matrix);
      placed.set(
        obj,
        [16, 20]
          .map((at) => m.pdfium.getValue(matrix + at, "float").toFixed(2))
          .join(","),
      );
    }
  } finally {
    m.pdfium.wasmExports.free(matrix);
  }
  return placed;
}

function inkOf(
  doc: EditorDocument,
  ptr: number,
): { left: number; right: number } {
  const m = doc.module;
  const box = m.pdfium.wasmExports.malloc(16);
  try {
    m.FPDFPageObj_GetBounds(ptr, box, box + 4, box + 8, box + 12);
    return {
      left: m.pdfium.getValue(box, "float"),
      right: m.pdfium.getValue(box + 8, "float"),
    };
  } finally {
    m.pdfium.wasmExports.free(box);
  }
}

const leftOf = (placed: Map<number, string>, ptr: number) =>
  Number(placed.get(ptr)!.split(",")[0]);

// The letters drawn on the baseline `y`, left to right, spaces left out.
function drawnOn(doc: EditorDocument, y: number): string {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const at = m.pdfium.wasmExports.malloc(16);
  const letters: Array<{ x: number; char: string }> = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      if (m.FPDFText_IsGenerated(textPage, i) === 1) continue;
      if (!m.FPDFText_GetCharOrigin(textPage, i, at, at + 8)) continue;
      if (Math.abs(m.pdfium.getValue(at + 8, "double") - y) > 1) continue;
      const char = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (char.trim())
        letters.push({ x: m.pdfium.getValue(at, "double"), char });
    }
  } finally {
    m.pdfium.wasmExports.free(at);
    m.FPDFText_ClosePage(textPage);
  }
  return letters
    .sort((a, b) => a.x - b.x)
    .map(({ char }) => char)
    .join("");
}

function edit(
  doc: EditorDocument,
  history: HistoryStack,
  run: TextRun,
  nextText: string,
): void {
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
    doc,
  );
}

async function reopened(doc: EditorDocument): Promise<EditorDocument> {
  const saved = await exportToBlob(doc);
  return open(new Uint8Array(await saved.arrayBuffer()));
}

describe("a line mixing directions", () => {
  test("reads numbers, Latin words and brackets in their own order", async () => {
    const doc = await open();

    expect(texts(doc)).toEqual([
      ARABIC,
      ARABIC_WITH_NAMES,
      HEBREW,
      ENGLISH,
      LATIN_FIRST,
    ]);
  });

  test("keeps every object where it was when letters are typed at its end", async () => {
    const doc = await open();
    const run = lineOf(doc, HEBREW);
    const before = placements(doc);

    edit(doc, new HistoryStack(), run, `${HEBREW} של`);

    const after = placements(doc);
    for (const [ptr, place] of before) expect(after.get(ptr)).toBe(place);
    expect(after.size).toBe(before.size + 1);
    const drawn = drawnOn(doc, run.matrix.f);
    expect(drawn.startsWith("לש.4")).toBe(true);
    expect(drawn).toContain("1,299.90");
    expect(drawn).toContain("03-555-1234");
    expect(texts(await reopened(doc))).toContain(`${HEBREW} של`);
  });

  test("grows a number typed after a Latin word leftwards with that word", async () => {
    const doc = await open();
    const run = lineOf(doc, ARABIC);
    const latin = run.mergedFromPtrs[run.mergedFromTexts.indexOf("ISO 50001")];
    const before = placements(doc);

    edit(doc, new HistoryStack(), run, `${ARABIC} 507`);

    const after = placements(doc);
    for (const [ptr, place] of before)
      if (ptr !== latin) expect(after.get(ptr)).toBe(place);
    expect(leftOf(after, latin)).toBeLessThan(leftOf(before, latin) - 5);
    const drawn = drawnOn(doc, run.matrix.f);
    expect(drawn.startsWith("ISO50001507")).toBe(true);
    expect(drawn).toContain("12,450.75");
    expect(drawn).toContain("[%3.5");
    expect(texts(await reopened(doc))).toContain(`${ARABIC} 507`);
  });

  test("moves the text after an insertion as one, and nothing before it", async () => {
    const doc = await open();
    const run = lineOf(doc, ARABIC);
    const at = ARABIC.indexOf("كيلوواط");
    const pieces = run.mergedFromPtrs.map((ptr, i) => ({
      ptr,
      start: run.mergedFromCharStarts[i],
    }));
    const before = placements(doc);
    const next = `${ARABIC.slice(0, at)}75 ${ARABIC.slice(at)}`;

    edit(doc, new HistoryStack(), run, next);

    const after = placements(doc);
    const shifts = pieces
      .filter(({ start }) => start >= at)
      .map(({ ptr }) => leftOf(after, ptr) - leftOf(before, ptr));
    for (const { ptr, start } of pieces)
      if (start < at - 1) expect(after.get(ptr)).toBe(before.get(ptr));
    expect(shifts[0]).toBeLessThan(-5);
    for (const shift of shifts) expect(shift).toBeCloseTo(shifts[0], 1);
    expect(drawnOn(doc, run.matrix.f)).toContain("7512,450.75");
    expect(texts(await reopened(doc))).toContain(next);
  });

  test("closes the gap a deleted word leaves and keeps the numbers beside it", async () => {
    const doc = await open();
    const run = lineOf(doc, ARABIC);
    const next = ARABIC.replace("كيلوواط ", "");

    edit(doc, new HistoryStack(), run, next);

    const drawn = drawnOn(doc, run.matrix.f);
    expect(drawn).toContain("]12,450.75(");
    expect(drawn.startsWith("ISO50001")).toBe(true);
    expect(texts(await reopened(doc))).toContain(next);
  });

  test("moves the rest of a line down at a line break, and back when the lines are joined", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, ARABIC);
    const at = ARABIC.indexOf("كيلوواط");
    const pieces = run.mergedFromPtrs.map((ptr, i) => ({
      ptr,
      start: run.mergedFromCharStarts[i],
    }));
    const before = placements(doc);
    const baselineOf = (placed: Map<number, string>, ptr: number) =>
      Number(placed.get(ptr)!.split(",")[1]);

    edit(doc, history, run, `${ARABIC.slice(0, at)}\n${ARABIC.slice(at)}`);

    const broken = placements(doc);
    expect(broken.size).toBe(before.size);
    for (const { ptr, start } of pieces) {
      if (start < at - 1) expect(broken.get(ptr)).toBe(before.get(ptr));
      if (start >= at)
        expect(baselineOf(broken, ptr)).toBeLessThan(
          baselineOf(before, ptr) - 10,
        );
    }
    const read = texts(await reopened(doc)).map((text) => text.trim());
    expect(read).toContain(ARABIC.slice(0, at).trim());
    expect(read).toContain(ARABIC.slice(at));

    edit(doc, history, run, ARABIC);

    // A glyph that ended a line is set back by its box, not its exact advance.
    const joined = placements(doc);
    expect(joined.size).toBe(before.size);
    for (const [ptr] of before) {
      expect(leftOf(joined, ptr)).toBeCloseTo(leftOf(before, ptr), 0);
      expect(baselineOf(joined, ptr)).toBeCloseTo(baselineOf(before, ptr), 1);
    }
    while (history.canUndo) history.undo(doc);
    expect([...placements(doc)]).toEqual([...before]);
  });

  test("redraws only the Latin word that is changed", async () => {
    const doc = await open();
    const run = lineOf(doc, ARABIC_WITH_NAMES);
    const next = ARABIC_WITH_NAMES.replace("Word", "Wordx");

    edit(doc, new HistoryStack(), run, next);

    const drawn = drawnOn(doc, run.matrix.f);
    expect(drawn).toContain("report-2026.docx");
    expect(drawn).toContain("Wordx");
    expect(drawn).toContain("LibreOfficeWriter");
    expect(texts(await reopened(doc))).toContain(next);
  });

  test("keeps an Arabic and a Hebrew quote in an English line", async () => {
    const doc = await open();
    const run = lineOf(doc, ENGLISH);
    const before = placements(doc);

    edit(doc, new HistoryStack(), run, `${ENGLISH} 42`);

    const after = placements(doc);
    for (const [ptr, place] of before) expect(after.get(ptr)).toBe(place);
    expect(texts(await reopened(doc))).toContain(`${ENGLISH} 42`);
  });

  test("survives a burst of edits, and undo puts every object back", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, HEBREW);
    const before = placements(doc);
    const steps = [
      HEBREW.replace("03-555-1234", "03-555-12345"),
      HEBREW.replace("03-555-1234", "03-555-12345").replace("Open ", ""),
      `${HEBREW.replace("03-555-1234", "03-555-12345").replace("Open ", "")} 9`,
    ];

    for (const step of steps) edit(doc, history, run, step);

    expect(run.text).toBe(steps[2]);
    expect(texts(await reopened(doc))).toContain(steps[2]);
    while (history.canUndo) history.undo(doc);
    expect(run.text).toBe(HEBREW);
    expect([...placements(doc)]).toEqual([...before]);
    while (history.canRedo) history.redo(doc);
    expect(run.text).toBe(steps[2]);
    expect(texts(await reopened(doc))).toContain(steps[2]);
  });

  test("sets one space between words typed one after another beside a drawn space", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, HEBREW);
    const at = HEBREW.indexOf("03-");
    const [first, rest] = [HEBREW.slice(0, at), HEBREW.slice(at)];
    edit(doc, history, run, `${first}\n${rest}`);
    const before = placements(doc);

    edit(doc, history, run, `${first} Pk\n${rest}`);
    edit(doc, history, run, `${first} Pk zap\n${rest}`);

    const typed = [...placements(doc).keys()]
      .filter((ptr) => !before.has(ptr))
      .map((ptr) => inkOf(doc, ptr))
      .sort((a, b) => a.left - b.left);
    expect(typed).toHaveLength(2);
    const gap = typed[1].left - typed[0].right;
    expect(gap).toBeGreaterThan(2);
    expect(gap).toBeLessThan(4.5);
  });

  test("refuses a whole redraw that no font can draw the line's own letters for", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, ARABIC);
    const before = placements(doc);
    // A box resized to wrap is redrawn whole.
    run.wrapWidthPt = run.bounds.width;

    expect(() => edit(doc, history, run, `${ARABIC} 5`)).toThrow(
      expect.objectContaining({ documentIntact: true }),
    );

    expect(run.text).toBe(ARABIC);
    expect(history.canUndo).toBe(false);
    expect([...placements(doc)]).toEqual([...before]);
  });

  test("leaves a save nothing to warn about when its whole redraw is refused", async () => {
    const doc = await EditorDocument.open(
      new Uint8Array(await readFile(SAMPLE)),
    );
    const store = new EditorStore();
    await store.setDocument(doc);
    try {
      PdfiumTextReader.populate(doc, doc.page(0));
      const run = lineOf(doc, ARABIC);
      // A box resized to wrap is redrawn whole.
      run.wrapWidthPt = run.bounds.width;

      store.dispatch(
        new EditTextCommand({
          pageIndex: 0,
          runId: run.id,
          nextText: `${ARABIC} 5`,
        }),
      );

      expect(store.getState().error).not.toBeNull();
      expect(run.text).toBe(ARABIC);
      expect(store.history.canUndo).toBe(false);
      expect(detectSaveRisks(doc).droppedChars).toEqual([]);
    } finally {
      store.dispose();
    }
  });

  test("leaves every line of a batch alone when one of its edits is refused", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const before = placements(doc);
    const batch = [ARABIC, LATIN_FIRST].map(
      (text) =>
        new EditTextCommand({
          pageIndex: 0,
          runId: lineOf(doc, text).id,
          nextText: text.replace("ISO 50001", "ISO 5000"),
        }),
    );

    expect(() => history.execute(new CompositeCommand(batch), doc)).toThrow(
      expect.objectContaining({ documentIntact: true }),
    );

    expect(texts(doc)).toContain(ARABIC);
    expect(texts(doc)).toContain(LATIN_FIRST);
    expect(history.canUndo).toBe(false);
    expect([...placements(doc)]).toEqual([...before]);
  });

  test("refuses an edit of a line it could not lay out the same way", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = lineOf(doc, LATIN_FIRST);
    const before = placements(doc);

    expect(run.readingOrderUnsure).toBe(true);
    expect(() => edit(doc, history, run, `${LATIN_FIRST} 5`)).toThrow(
      expect.objectContaining({ documentIntact: true }),
    );

    expect(run.text).toBe(LATIN_FIRST);
    expect(history.canUndo).toBe(false);
    expect([...placements(doc)]).toEqual([...before]);
  });
});
