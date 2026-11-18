// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const HEADING_PDF = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/chrome-per-glyph-heading.pdf",
);
const HEADING = "Audit Desk Notes";
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

async function openHeading() {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(HEADING_PDF)),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const run = doc.page(0).runs.find((r) => r.text === HEADING);
  if (!run) throw new Error("heading run not found");
  return { doc, run };
}

function headingObjectLefts(doc: EditorDocument, topY: number): number[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const box = m.pdfium.wasmExports.malloc(16);
  const lefts: number[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12);
      const top = m.pdfium.getValue(box + 12, "float");
      if (Math.abs(top - topY) > 6) continue;
      lefts.push(m.pdfium.getValue(box, "float"));
    }
  } finally {
    m.pdfium.wasmExports.free(box);
  }
  return lefts.sort((a, b) => a - b);
}

test("typing a space between words and deleting it leaves no gap", async () => {
  const { doc, run } = await openHeading();
  const topY = run.bounds.y + run.bounds.height;
  const before = headingObjectLefts(doc, topY);
  const history = new HistoryStack();

  for (const nextText of ["Audit Desk  Notes", HEADING]) {
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
      doc,
    );
    history.breakCoalescing();
  }

  const after = headingObjectLefts(doc, topY);
  expect(after.length).toBe(before.length);
  after.forEach((x, i) => expect(Math.abs(x - before[i])).toBeLessThan(0.5));

  history.undo(doc);
  history.undo(doc);
  const undone = headingObjectLefts(doc, topY);
  undone.forEach((x, i) => expect(Math.abs(x - before[i])).toBeLessThan(0.05));
});
