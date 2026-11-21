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
import { lookalikeFamilyFor } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/stirling-marketing.pdf",
);
const PAGE = 1;
const OLD_END = "and more.";
const NEW_END = "and much more.";

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

async function open(bytes?: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    bytes ?? new Uint8Array(await readFile(SAMPLE)),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(PAGE));
  return doc;
}

function paragraph(doc: EditorDocument) {
  const run = doc
    .page(PAGE)
    .runs.find((r) => r.text.startsWith("Stirling PDF is a robust"));
  if (!run) throw new Error("no paragraph run");
  return run;
}

function baseFontName(doc: EditorDocument, font: number): string {
  const m = doc.module;
  const len = m.FPDFFont_GetBaseFontName(font, 0, 0);
  if (len <= 1) return "";
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    m.FPDFFont_GetBaseFontName(font, buf, len);
    return m.pdfium.UTF8ToString(buf);
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

function hasFontProgram(doc: EditorDocument, font: number): boolean {
  const m = doc.module;
  const out = m.pdfium.wasmExports.malloc(4);
  try {
    m.pdfium.setValue(out, 0, "i32");
    return (
      !!m.FPDFFont_GetFontData(font, 0, 0, out) &&
      m.pdfium.getValue(out, "i32") > 0
    );
  } finally {
    m.pdfium.wasmExports.free(out);
  }
}

function pageFonts(doc: EditorDocument): Set<number> {
  const m = doc.module;
  const pagePtr = doc.page(PAGE).pagePtr;
  const fonts = new Set<number>();
  for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
    const obj = m.FPDFPage_GetObject(pagePtr, i);
    if (m.FPDFPageObj_GetType(obj) === 1) fonts.add(m.FPDFTextObj_GetFont(obj));
  }
  return fonts;
}

interface DrawnChar {
  ch: string;
  x: number;
  y: number;
  font: number;
}

function drawnChars(doc: EditorDocument): DrawnChar[] {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(PAGE).pagePtr);
  const xy = m.pdfium.wasmExports.malloc(16);
  const chars: DrawnChar[] = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      const ch = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (!/\S/.test(ch)) continue;
      m.FPDFText_GetCharOrigin(textPage, i, xy, xy + 8);
      chars.push({
        ch,
        x: m.pdfium.getValue(xy, "double"),
        y: m.pdfium.getValue(xy + 8, "double"),
        font: m.FPDFTextObj_GetFont(m.FPDFText_GetTextObject(textPage, i)),
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(xy);
  }
  return chars.sort((a, b) => Math.round(b.y) - Math.round(a.y) || a.x - b.x);
}

function drawnWord(doc: EditorDocument, word: string): DrawnChar[] | null {
  const chars = drawnChars(doc);
  const target = word.replace(/\s+/g, "");
  const at = chars
    .map(({ ch }) => ch)
    .join("")
    .indexOf(target);
  return at < 0 ? null : chars.slice(at, at + target.length);
}

function retype(history: HistoryStack, doc: EditorDocument) {
  const run = paragraph(doc);
  const at = run.text.lastIndexOf(OLD_END);
  expect(at).toBeGreaterThan(0);
  history.execute(
    new EditTextCommand({
      pageIndex: PAGE,
      runId: run.id,
      nextText:
        run.text.slice(0, at) + NEW_END + run.text.slice(at + OLD_END.length),
    }),
    doc,
  );
}

test("an unnamed Type 3 paragraph font is named by its descriptor", async () => {
  const doc = await open();
  expect(paragraph(doc).fontId).toMatch(/:\.SFNS-Regular$/);
});

test("a word typed into a paragraph drawn across sibling Type 3 fonts reuses the document's glyphs", async () => {
  const doc = await open();
  const before = pageFonts(doc);
  retype(new HistoryStack(), doc);

  expect(paragraph(doc).text).toContain(NEW_END);
  const much = drawnWord(doc, "much");
  expect(much?.map(({ ch }) => ch).join("")).toBe("much");
  for (const { font } of much!) {
    expect(before.has(font)).toBe(true);
    expect(baseFontName(doc, font)).toBe("");
    expect(hasFontProgram(doc, font)).toBe(false);
  }
  const xs = drawnWord(doc, NEW_END)!.map(({ x }) => x);
  for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
});

test("the reused glyphs survive a save and read back as the typed text", async () => {
  const doc = await open();
  retype(new HistoryStack(), doc);
  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  expect(paragraph(saved).text).toContain(NEW_END);
  const much = drawnWord(saved, "much");
  expect(much).not.toBeNull();
  for (const { font } of much!) expect(baseFontName(saved, font)).toBe("");
});

test("undo puts the original ending back", async () => {
  const doc = await open();
  const history = new HistoryStack();
  const original = paragraph(doc).text;
  retype(history, doc);
  history.undo(doc);
  expect(paragraph(doc).text).toBe(original);
  expect(drawnWord(doc, "much")).toBeNull();
  expect(drawnWord(doc, OLD_END)).not.toBeNull();
});

test("an edit drawn wholly in the document's glyphs is recorded as substituting none", async () => {
  const doc = await open();
  expect(paragraph(doc).snapshot().substitutedGlyphs).toBeUndefined();
  retype(new HistoryStack(), doc);
  expect(paragraph(doc).snapshot().substitutedGlyphs).toBe(false);
});

test("a system UI face with no glyph in the document falls back to a Helvetica lookalike", async () => {
  expect(await lookalikeFamilyFor("pdf:1:.SFNS-Regular")).toBe("Helvetica");
  expect(await lookalikeFamilyFor("pdf:1:SFProText-Bold")).toBe(
    "Helvetica-Bold",
  );
  expect(await lookalikeFamilyFor("pdf:1:Georgia")).toBeNull();
});
