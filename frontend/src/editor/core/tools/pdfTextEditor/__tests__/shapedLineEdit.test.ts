// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  applyPartialEditPlan,
  planPartialEdit,
  revertPartialEditPlan,
} from "@editor/tools/pdfTextEditor/commands/partialEdit";
import { readObjFill } from "@editor/tools/pdfTextEditor/pdfium/PdfiumObjectColour";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

// A left-to-right line whose producer drew three letters apart from their vowel signs: each pair is two text objects inside one ActualText span.
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/shaped-line-sample.pdf",
);
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

const lineOf = (doc: EditorDocument) => doc.page(0).runs[0];

/** The text of every run once the document is saved and opened again. */
async function reopenedTexts(doc: EditorDocument): Promise<string[]> {
  const saved = await exportToBlob(doc);
  const again = await open(new Uint8Array(await saved.arrayBuffer()));
  return again.page(0).runs.map((run) => run.text);
}

/** Every text object on the page in content order, with the left edge of its ink; a space glyph has none and is left out. */
function inked(doc: EditorDocument): Map<number, number> {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const box = m.pdfium.wasmExports.malloc(16);
  const found = new Map<number, number>();
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      if (!m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12))
        continue;
      const left = m.pdfium.getValue(box, "float");
      if (m.pdfium.getValue(box + 8, "float") - left > 0.01)
        found.set(obj, left);
    }
  } finally {
    m.pdfium.wasmExports.free(box);
  }
  return found;
}

/** Each piece of the line that holds text with the pieces after it that hold none: a letter and the objects drawing the rest of its glyphs. */
function clusters(run: TextRun): number[][] {
  const found: number[][] = [];
  run.mergedFromPtrs.forEach((ptr, i) => {
    if (run.mergedFromTexts[i] === "" && found.length > 0)
      found[found.length - 1].push(ptr);
    else found.push([ptr]);
  });
  return found;
}

const shaped = (run: TextRun) =>
  clusters(run).filter((cluster) => cluster.length > 1);

/** Whether the objects of each cluster follow one another in content order with nothing between them. */
function drawnTogether(doc: EditorDocument, run: TextRun): boolean {
  const order = [...inked(doc).keys()];
  return shaped(run).every((cluster) => {
    const at = cluster.map((ptr) => order.indexOf(ptr)).sort((a, b) => a - b);
    return at[0] >= 0 && at[at.length - 1] - at[0] === cluster.length - 1;
  });
}

function edit(
  doc: EditorDocument,
  history: HistoryStack,
  next: (text: string) => string,
): TextRun {
  const run = lineOf(doc);
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: next(run.text),
    }),
    doc,
  );
  return run;
}

test("a line owns the letter and the vowel sign of a pair drawn as two objects", async () => {
  const doc = await open();
  const run = lineOf(doc);

  expect(shaped(run)).toHaveLength(3);
  expect([...inked(doc).keys()]).toEqual(run.mergedFromPtrs);
  expect(await reopenedTexts(doc)).toEqual([run.text]);
});

test("a letter typed at the start moves every vowel sign with its letter", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const before = inked(doc);
  const pairs = shaped(lineOf(doc));

  const run = edit(doc, history, (text) => `x${text}`);

  const after = inked(doc);
  const moved = (ptr: number) => after.get(ptr)! - before.get(ptr)!;
  expect(shaped(run)).toEqual(pairs);
  for (const [letter, sign] of pairs) {
    expect(moved(letter)).toBeGreaterThan(1);
    expect(moved(sign)).toBeCloseTo(moved(letter), 2);
  }
  expect(drawnTogether(doc, run)).toBe(true);
  expect(await reopenedTexts(doc)).toEqual([run.text]);

  history.undo(doc);
  expect(inked(doc)).toEqual(before);
  expect(await reopenedTexts(doc)).toEqual([run.text]);

  history.redo(doc);
  expect(shaped(run)).toEqual(pairs);
  for (const [ptr, left] of after)
    if (before.has(ptr)) expect(inked(doc).get(ptr)).toBeCloseTo(left, 2);
  expect(await reopenedTexts(doc)).toEqual([run.text]);
});

test("letters typed after a pair are drawn after both of its objects", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const before = inked(doc);

  const run = edit(doc, history, (text) => text.replace("2024", "20x24"));

  expect(run.text).toContain("20x24");
  expect(shaped(run)).toHaveLength(3);
  expect(drawnTogether(doc, run)).toBe(true);
  expect(await reopenedTexts(doc)).toEqual([run.text]);

  history.undo(doc);
  expect(inked(doc)).toEqual(before);
  history.redo(doc);
  expect(drawnTogether(doc, run)).toBe(true);
  expect(await reopenedTexts(doc)).toEqual([run.text]);
});

test("a deleted word takes its vowel sign off the page with its letter", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const before = inked(doc);
  const [gone, ...kept] = shaped(lineOf(doc));

  const run = edit(doc, history, (text) => text.slice(text.indexOf(" ") + 1));

  const after = inked(doc);
  for (const ptr of gone) expect(after.has(ptr)).toBe(false);
  expect(shaped(run)).toEqual(kept);
  expect([...after.keys()]).toEqual(run.mergedFromPtrs);
  const moved = (ptr: number) => after.get(ptr)! - before.get(ptr)!;
  for (const [letter, sign] of kept) {
    expect(moved(letter)).toBeLessThan(-1);
    expect(moved(sign)).toBeCloseTo(moved(letter), 2);
  }
  expect(await reopenedTexts(doc)).toEqual([run.text]);

  history.undo(doc);
  expect(inked(doc)).toEqual(before);
  expect(await reopenedTexts(doc)).toEqual([run.text]);
});

test("a vowel sign deleted from its letter is no longer drawn", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const before = inked(doc);
  const [changed, ...kept] = shaped(lineOf(doc));

  const run = edit(doc, history, (text) => text.replace("े", ""));

  const after = inked(doc);
  for (const ptr of changed) expect(after.has(ptr)).toBe(false);
  expect(shaped(run)).toEqual(kept);
  expect([...after.keys()]).toEqual(run.mergedFromPtrs);
  expect(await reopenedTexts(doc)).toEqual([run.text]);

  history.undo(doc);
  expect(inked(doc)).toEqual(before);
  expect(await reopenedTexts(doc)).toEqual([run.text]);
});

test("a run of edits keeps every pair whole, and undo puts every object back", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const before = inked(doc);
  const steps: Array<(text: string) => string> = [
    (text) => `x${text}`,
    (text) => `${text}y`,
    (text) => text.replace("2024", "20z24"),
    (text) => text.slice(text.indexOf(" ") + 1),
  ];

  for (const step of steps) {
    history.breakCoalescing();
    const run = edit(doc, history, step);
    expect(new Set(inked(doc).keys())).toEqual(new Set(run.mergedFromPtrs));
    expect(drawnTogether(doc, run)).toBe(true);
    expect(await reopenedTexts(doc)).toEqual([run.text]);
  }
  expect(shaped(lineOf(doc))).toHaveLength(2);

  for (const _ of steps) history.undo(doc);
  expect(inked(doc)).toEqual(before);
  expect(await reopenedTexts(doc)).toEqual([lineOf(doc).text]);
});

test("an undo that cannot put the original objects back still returns each vowel sign with its letter", async () => {
  const doc = await open();
  const m = doc.module;
  const page = doc.page(0);
  const run = lineOf(doc);
  const before = inked(doc);
  const tags = uniformTags(run.tagMarks);
  const prev = {
    fonts: run.mergedFromPtrs.map((ptr) => m.FPDFTextObj_GetFont(ptr)),
    fills: run.mergedFromPtrs.map((ptr) => readObjFill(m, ptr)),
    charStarts: [...run.mergedFromCharStarts],
    baselineY: run.matrix.f,
    fontSubset: run.fontSubset,
  };
  const plan = planPartialEdit(run, run.text, `x${run.text}`)!;
  const applied = applyPartialEditPlan(doc, page, run, plan, tags);
  for (const ptr of applied.insertedPtrs)
    m.FPDFPage_RemoveObject(page.pagePtr, ptr);

  const redrawn = revertPartialEditPlan(
    doc,
    page,
    run,
    plan,
    prev,
    () => tags,
    "Helvetica",
  );

  expect(redrawn?.size).toBe(0);
  const after = inked(doc);
  expect([...after.keys()]).toEqual([...before.keys()]);
  for (const [ptr, left] of before) expect(after.get(ptr)).toBeCloseTo(left, 1);
});
