// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rtl-marks-sample.pdf",
);
const HEBREW = "שָׁלוֹם עוֹלָם";
const ARABIC = "يُولَدُ جَمِيعُ النَّاسِ";
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

const texts = (doc: EditorDocument) =>
  doc.page(0).runs.map((run) => run.text.normalize("NFC"));

test("reads each vowel mark after the letter it sits on", async () => {
  const doc = await open();

  expect(texts(doc)).toEqual([HEBREW, ARABIC].map((t) => t.normalize("NFC")));
});

// Every text object on the page that draws ink, a space glyph left out.
function inked(doc: EditorDocument): number[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const box = m.pdfium.wasmExports.malloc(16);
  const found: number[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      if (!m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12))
        continue;
      const width =
        m.pdfium.getValue(box + 8, "float") - m.pdfium.getValue(box, "float");
      if (width > 0.01) found.push(obj);
    }
  } finally {
    m.pdfium.wasmExports.free(box);
  }
  return found;
}

// The bottom edge of each inked text object whose ink lies between `bottom` and `top`.
function inkedBetween(
  doc: EditorDocument,
  bottom: number,
  top: number,
): Map<number, number> {
  const m = doc.module;
  const box = m.pdfium.wasmExports.malloc(16);
  const found = new Map<number, number>();
  try {
    for (const ptr of inked(doc)) {
      m.FPDFPageObj_GetBounds(ptr, box, box + 4, box + 8, box + 12);
      const low = m.pdfium.getValue(box + 4, "float");
      if (low >= bottom && m.pdfium.getValue(box + 12, "float") <= top)
        found.set(ptr, low);
    }
  } finally {
    m.pdfium.wasmExports.free(box);
  }
  return found;
}

const owned = (doc: EditorDocument) =>
  new Set(doc.page(0).runs.flatMap((run) => run.mergedFromPtrs));

test("a line owns the letter and the mark of a pair drawn as two objects", async () => {
  const doc = await open();

  const stray = inked(doc).filter((ptr) => !owned(doc).has(ptr));

  expect(stray).toEqual([]);
});

test("leaves no letter or mark behind when a word with vowel marks is deleted", async () => {
  const doc = await open();
  const run = doc.page(0).runs[0];
  const before = inked(doc).length;
  const [kept] = run.text.split(" ");

  new HistoryStack().execute(
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: kept }),
    doc,
  );

  const left = inked(doc);
  expect(left.filter((ptr) => !owned(doc).has(ptr))).toEqual([]);
  expect(left.length).toBeLessThan(before);
  expect(texts(doc)[0]).toBe(kept.normalize("NFC"));
});

test("draws each mark once after a letter is typed on its line", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const run = doc.page(0).runs[0];
  const before = inked(doc);

  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: `${run.text} ם`,
    }),
    doc,
  );

  const after = inked(doc);
  expect(after.filter((ptr) => !owned(doc).has(ptr))).toEqual([]);
  expect(after.length).toBe(before.length + 1);
  for (const ptr of before) expect(after).toContain(ptr);
  history.undo(doc);
  expect(inked(doc)).toEqual(before);
});

test("reads a letter and its mark once after a letter is typed straight after them", async () => {
  const doc = await open();
  const run = doc.page(0).runs[0];
  const at = run.text.indexOf("ל");
  const next = `${run.text.slice(0, at)}ם${run.text.slice(at)}`;

  new HistoryStack().execute(
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: next }),
    doc,
  );

  const saved = await exportToBlob(doc);
  const again = await open(new Uint8Array(await saved.arrayBuffer()));
  expect(texts(again)).toEqual([next, ARABIC].map((t) => t.normalize("NFC")));
});

test("moves and deletes every letter and mark of a line together", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const run = doc.page(0).runs[0];
  const band = [run.bounds.y - 6, run.bounds.y + run.bounds.height + 6];
  const before = inkedBetween(doc, band[0], band[1]);

  history.execute(
    new MoveTextRunCommand({ pageIndex: 0, runId: run.id, dx: 0, dy: 30 }),
    doc,
  );

  const moved = inkedBetween(doc, band[0] + 30, band[1] + 30);
  expect(moved.size).toBe(before.size);
  for (const [ptr, low] of before)
    expect(moved.get(ptr)).toBeCloseTo(low + 30, 1);

  history.execute(
    new DeleteObjectCommand({ pageIndex: 0, runId: run.id }),
    doc,
  );

  expect(inkedBetween(doc, band[0] + 30, band[1] + 30).size).toBe(0);
  expect(inkedBetween(doc, band[0], band[1]).size).toBe(0);
});
