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
import { lacksGlyphsFor } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

// A LaTeX document: its Latin Modern subset holds only the letters the text uses, and no "9" or "Q".
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/mushroom-life.pdf",
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

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

interface Drawn {
  text: string;
  font: number;
  name: string;
}

function drawnObjects(doc: EditorDocument): Drawn[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const text = m.pdfium.wasmExports.malloc(1024);
  const name = m.pdfium.wasmExports.malloc(256);
  const textPage = m.FPDFText_LoadPage(pagePtr);
  const out: Drawn[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFTextObj_GetText(obj, textPage, text, 512);
      const font = m.FPDFTextObj_GetFont(obj);
      m.FPDFFont_GetBaseFontName(font, name, 256);
      out.push({
        text: m.pdfium.UTF16ToString(text),
        font,
        name: m.pdfium.UTF8ToString(name),
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(text);
    m.pdfium.wasmExports.free(name);
  }
  return out;
}

async function typeBefore(
  doc: EditorDocument,
  word: string,
  typed: string,
): Promise<string> {
  const page = doc.page(0);
  const run = page.runs.find(
    (r) =>
      r.text.includes(`${word} represent`) ||
      r.text.includes(`Mushrooms ${word}`),
  )!;
  for (const ch of typed) {
    const current = page.runs.find((r) => r.id === run.id)!.text;
    const at = current.indexOf(word);
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: current.slice(0, at) + ch + current.slice(at),
    }).apply(doc);
  }
  return run.id;
}

describe("typing a word against one the document's font draws", () => {
  test("draws every typed letter, even one the font has no glyph for", async () => {
    const doc = await open(new Uint8Array(await readFile(SAMPLE)));
    const blank = () =>
      drawnObjects(doc)
        .filter(({ text, font }) => lacksGlyphsFor(doc.module, font, text))
        .map(({ text }) => text);
    const before = blank();
    await typeBefore(doc, "represent", "Wj9 ");

    expect(blank()).toEqual(before);
  });

  test("leaves the word it was typed against in the document's font", async () => {
    const doc = await open(new Uint8Array(await readFile(SAMPLE)));
    const fontBefore = drawnObjects(doc).find(({ text }) =>
      text.includes("Mushrooms"),
    )!.name;
    await typeBefore(doc, "represent", "Wj9 ");

    const word = drawnObjects(doc).find(({ text }) =>
      /^represent\s*$/.test(text),
    );
    expect(word?.name).toBe(fontBefore);
  });

  test("keeps the edited paragraph one box when the file is opened again", async () => {
    const doc = await open(new Uint8Array(await readFile(SAMPLE)));
    const paragraphs = doc.page(0).runs.length;
    await typeBefore(doc, "Mushrooms", "Xk ");

    const saved = new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
    const again = await open(saved);
    expect(again.page(0).runs).toHaveLength(paragraphs);
    expect(
      again.page(0).runs.find((r) => r.text.includes("Xk Mushrooms"))?.text,
    ).toContain("tion in the biological world");
  });
});
