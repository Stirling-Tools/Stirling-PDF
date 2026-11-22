// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/subset-truetype-heading.pdf",
);
const HEADING = "Quarterly report heading";
const FPDF_PAGEOBJ_TEXT = 1;

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

function edit(doc: EditorDocument, runId: string, nextText: string): void {
  new EditTextCommand({ pageIndex: 0, runId, nextText }).apply(doc);
}

// The subset holds only the letters the heading used, so any other letter drawn in it has no outline.
function lettersDrawnInFont(doc: EditorDocument, font: number): string {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const textPage = m.FPDFText_LoadPage(pagePtr);
  const buffer = m.pdfium.wasmExports.malloc(1024);
  let drawn = "";
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      if (m.FPDFTextObj_GetFont(obj) !== font) continue;
      m.FPDFTextObj_GetText(obj, textPage, buffer, 1024);
      drawn += m.pdfium.UTF16ToString(buffer);
    }
  } finally {
    m.pdfium.wasmExports.free(buffer);
    m.FPDFText_ClosePage(textPage);
  }
  return drawn;
}

test("joining two lines keeps letters the subset font lacks in their fallback face", async () => {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
  expect(run).toBeDefined();
  const subset = doc.module.FPDFTextObj_GetFont(run.pdfiumObjPtr);
  const typed = " quick jump";

  edit(doc, run.id, "Quarterly report \nheading");
  edit(doc, run.id, `Quarterly report \nheading${typed}`);
  edit(doc, run.id, `Quarterly report heading${typed}`);

  expect(doc.page(0).findRun(run.id)?.text).toBe(`${HEADING}${typed}`);
  const outsideSubset = [
    ...lettersDrawnInFont(doc, subset).replace(/\s/g, ""),
  ].filter((ch) => !HEADING.includes(ch));
  expect(outsideSubset).toEqual([]);
});
