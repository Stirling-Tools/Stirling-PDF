// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { rasterFirstPage } from "@editor/tools/pdfTextEditor/__tests__/pageRaster";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
// Set by cairo with a TJ kern between most letter pairs.
const KERNED_HEADING = "subset-truetype-heading.pdf";
const HEADING = "Quarterly report heading";
const SIZE = 600;

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open(source: string | Uint8Array): Promise<EditorDocument> {
  const bytes =
    typeof source === "string"
      ? new Uint8Array(await readFile(path.join(FIXTURES, source)))
      : source;
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

interface Glyph {
  char: string;
  x: number;
  y: number;
}

function glyphs(doc: EditorDocument): Glyph[] {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const at = m.pdfium.wasmExports.malloc(16);
  try {
    return Array.from({ length: m.FPDFText_CountChars(textPage) }, (_, i) => {
      m.FPDFText_GetCharOrigin(textPage, i, at, at + 8);
      return {
        char: String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i)),
        x: m.pdfium.getValue(at, "double"),
        y: m.pdfium.getValue(at + 8, "double"),
      };
    });
  } finally {
    m.pdfium.wasmExports.free(at);
    m.FPDFText_ClosePage(textPage);
  }
}

function differingBytes(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}

function furthestShiftPt(before: Glyph[], after: Glyph[]): number {
  expect(after.map((g) => g.char).join("")).toBe(
    before.map((g) => g.char).join(""),
  );
  return Math.max(
    ...before.map((g, i) =>
      Math.max(Math.abs(g.x - after[i].x), Math.abs(g.y - after[i].y)),
    ),
  );
}

async function expectAsUntouched(doc: EditorDocument, file: string) {
  const untouched = await open(file);
  expect(furthestShiftPt(glyphs(untouched), glyphs(doc))).toBeLessThan(0.01);
  expect(
    differingBytes(
      rasterFirstPage(untouched, SIZE, SIZE),
      rasterFirstPage(doc, SIZE, SIZE),
    ),
  ).toBe(0);
}

function edit(
  doc: EditorDocument,
  history: HistoryStack,
  text: string,
  steps: string[],
) {
  const run = doc.page(0).runs.find((r) => r.text === text)!;
  for (const nextText of steps)
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
      doc,
    );
  return run;
}

test.each([
  { edit: "deleting a letter", steps: ["Quarterly reprt heading"] },
  { edit: "typing into a word", steps: ["QuarZterly report heading"] },
  {
    edit: "typing two letters into a word",
    steps: ["QuarZterly report heading", "QuarZbterly report heading"],
  },
  { edit: "replacing a letter", steps: ["Quarterly reXort heading"] },
  {
    edit: "several deletions and a typed letter",
    steps: [
      "Quarterly reprt heading",
      "Quarterly rept heading",
      "Quartrly rept heading",
      "Quartrly rept headXing",
    ],
  },
])(
  "undoing $edit on a kerned heading puts every letter back where it was drawn",
  async ({ steps }) => {
    const doc = await open(KERNED_HEADING);
    const history = new HistoryStack();
    const run = edit(doc, history, HEADING, steps);

    while (history.canUndo) history.undo(doc);

    expect(run.text).toBe(HEADING);
    await expectAsUntouched(doc, KERNED_HEADING);
  },
);

test("redo after an exact undo draws the edit again, and undo puts it back again", async () => {
  const doc = await open(KERNED_HEADING);
  const history = new HistoryStack();
  const run = edit(doc, history, HEADING, ["Quarterly reprt heading"]);
  const edited = glyphs(doc);
  const editedRaster = rasterFirstPage(doc, SIZE, SIZE);

  history.undo(doc);
  history.redo(doc);

  expect(run.text).toBe("Quarterly reprt heading");
  expect(furthestShiftPt(edited, glyphs(doc))).toBeLessThan(0.01);
  expect(differingBytes(editedRaster, rasterFirstPage(doc, SIZE, SIZE))).toBe(
    0,
  );

  history.undo(doc);
  await expectAsUntouched(doc, KERNED_HEADING);
});

test("saving after undoing a deleted letter writes the heading as the untouched file draws it", async () => {
  const doc = await open(KERNED_HEADING);
  const history = new HistoryStack();
  edit(doc, history, HEADING, ["Quarterly reprt heading"]);
  history.undo(doc);

  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );

  expect(saved.page(0).runs.map((r) => r.text)).toEqual([HEADING]);
  await expectAsUntouched(saved, KERNED_HEADING);
});

test.each([
  "Large Palatino display line.",
  "Small Times New Roman footnote text line.",
])(
  "undoing a deleted letter in the kerned cairo line %s is exact",
  async (line) => {
    const doc = await open("cairo-styles.pdf");
    const history = new HistoryStack();
    const run = edit(doc, history, line, [line.replace("e", "")]);

    history.undo(doc);

    expect(run.text).toBe(line);
    await expectAsUntouched(doc, "cairo-styles.pdf");
  },
);

test("undoing a deleted letter on a line of a kerned paragraph is exact", async () => {
  const doc = await open("cairo-styles.pdf");
  const run = doc.page(0).runs.find((r) => r.text.startsWith("Accents:"))!;
  const original = run.text;
  const history = new HistoryStack();
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: original.replace("naïve", "naïe"),
    }),
    doc,
  );

  history.undo(doc);

  expect(run.text).toBe(original);
  await expectAsUntouched(doc, "cairo-styles.pdf");
});
