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
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/mixed-style-sample.pdf",
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

// Every text object on the page as "text@font", sorted.
function drawn(doc: EditorDocument): string[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const textPage = m.FPDFText_LoadPage(pagePtr);
  const text = m.pdfium.wasmExports.malloc(1024);
  const name = m.pdfium.wasmExports.malloc(256);
  const out: string[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFTextObj_GetText(obj, textPage, text, 512);
      m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(obj), name, 256);
      out.push(
        `${m.pdfium.UTF16ToString(text).trim()}@${m.pdfium.UTF8ToString(name)}`,
      );
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(text);
    m.pdfium.wasmExports.free(name);
  }
  return out.sort();
}

describe("a line broken with Enter and then typed on", () => {
  test("undoes to the very objects it started from, symbols and faces included", async () => {
    const doc = await EditorDocument.open(
      new Uint8Array(await readFile(SAMPLE)),
    );
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    const before = drawn(doc);
    const runId = doc.page(0).runs.find((r) => r.text.includes("Plain"))!.id;
    const history = new HistoryStack();
    const type = (change: (text: string) => string) =>
      history.execute(
        new EditTextCommand({
          pageIndex: 0,
          runId,
          nextText: change(doc.page(0).findRun(runId)!.text),
        }),
        doc,
      );

    type((text) => text.replace("italic ", "italic \n"));
    type((text) => text.replace("\n and both", " Pk\n and both"));
    type((text) => `${text} Pasted`);
    history.undo(doc);

    expect(drawn(doc)).toEqual(before);
  });
});
