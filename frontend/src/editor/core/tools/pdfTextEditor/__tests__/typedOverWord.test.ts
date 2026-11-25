// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { resetContentStreamCache } from "@editor/tools/pdfTextEditor/charcode/ContentStreamResolver";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  resetCharCoverageCache,
  resetOnPageAdvCache,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
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
  // Keyed by font and page pointers, which the next document reuses.
  resetCharCoverageCache();
  resetContentStreamCache();
  resetOnPageAdvCache();
});

afterAll(() => vi.unstubAllGlobals());

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

const fixture = async (name: string) =>
  open(new Uint8Array(await readFile(path.join(FIXTURES, name))));

const saved = async (doc: EditorDocument) =>
  open(new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()));

interface Glyph {
  char: string;
  x: number;
}

interface Drawn {
  text: string;
  font: string;
  left: number;
  glyphs: Glyph[];
}

/** Every text object on the baseline at `y`, with the characters its glyphs drew and where. */
function drawnOn(doc: EditorDocument, y: number): Drawn[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const buf = m.pdfium.wasmExports.malloc(1024);
  const textPage = m.FPDFText_LoadPage(pagePtr);
  const glyphs = new Map<number, Glyph[]>();
  const out: Drawn[] = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      if (m.FPDFText_IsGenerated(textPage, i) === 1) continue;
      const obj = m.FPDFText_GetTextObject(textPage, i);
      m.FPDFText_GetCharOrigin(textPage, i, buf, buf + 8);
      const drawn = glyphs.get(obj) ?? [];
      drawn.push({
        char: String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i)),
        x: m.pdfium.getValue(buf, "double"),
      });
      glyphs.set(obj, drawn);
    }
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFPageObj_GetBounds(obj, buf, buf + 4, buf + 8, buf + 12);
      const left = m.pdfium.getValue(buf, "float");
      const bottom = m.pdfium.getValue(buf + 4, "float");
      const top = m.pdfium.getValue(buf + 12, "float");
      if (bottom > y + 1 || top < y) continue;
      m.FPDFTextObj_GetText(obj, textPage, buf, 512);
      const text = m.pdfium.UTF16ToString(buf);
      m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(obj), buf, 256);
      out.push({
        text,
        font: m.pdfium.UTF8ToString(buf),
        left: Math.round(left * 10) / 10,
        glyphs: glyphs.get(obj) ?? [],
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(buf);
  }
  return out;
}

/** Give the line holding `word` each of `texts` in turn, as a key at a time does. */
function typeTexts(
  doc: EditorDocument,
  history: HistoryStack,
  word: string,
  texts: (original: string) => string[],
) {
  const run = doc.page(0).runs.find((r) => r.text.includes(word))!;
  const original = run.text;
  for (const nextText of texts(original))
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
      doc,
    );
  return { run, original, baseline: run.matrix.f };
}

/** Select `word` in the line holding it and type `typed` over it. */
function typeOver(
  doc: EditorDocument,
  history: HistoryStack,
  word: string,
  typed: string,
) {
  return typeTexts(doc, history, word, (original) =>
    [...typed].map((_, keys) =>
      original.replace(word, typed.slice(0, keys + 1)),
    ),
  );
}

const lettersIn = (drawn: Drawn[], font: RegExp) =>
  drawn
    .filter((object) => font.test(object.font))
    .flatMap((object) => [...object.text.replace(/\s/g, "")]);

const lineAt = (doc: EditorDocument, y: number) =>
  doc
    .page(0)
    .runs.filter((r) => Math.abs(r.matrix.f - y) < 2)
    .map((r) => r.text);

/** How far the glyph drawing "ti" moves the pen, from where the "c" after it starts: a ligature's advance, which neither a missing-glyph box nor an "i" alone has. */
function ligatureAdvance(drawn: Drawn[]): number | null {
  for (const { glyphs } of drawn)
    for (let i = 0; i + 2 < glyphs.length; i++)
      if (
        glyphs
          .slice(i, i + 3)
          .map(({ char }) => char)
          .join("") === "tic"
      )
        return glyphs[i + 2].x - glyphs[i].x;
  return null;
}

test.each([
  [
    "a word typed over a selected one",
    ["Quarterly Z heading", "Quarterly Ze heading", "Quarterly Zebra heading"],
    (drawn: Drawn) => drawn,
  ],
  // Deleting a letter rewrites the heading's object in place, and undoing that lays its letters out afresh.
  [
    "letters typed into the middle of a word",
    [
      "Quaterly report heading",
      "QuaZterly report heading",
      "QuaZbterly report heading",
    ],
    ({ text, font, left }: Drawn) => ({ text, font, left }),
  ],
])(
  "draws %s in a face that has the letters when the document's subset keeps a box for those it lacks",
  async (_case, texts, restored) => {
    const doc = await fixture("subset-truetype-heading.pdf");
    const history = new HistoryStack();
    const subset = /DejaVuSans-Bold/;
    const held = new Set("Quarterlyreportheading");
    const next = texts.at(-1)!;
    const before = drawnOn(
      doc,
      doc.page(0).runs.find((r) => r.text.includes("Quarterly"))!.matrix.f,
    );

    const { run, original, baseline } = typeTexts(
      doc,
      history,
      "Quarterly",
      () => texts,
    );

    expect(run.text).toBe(next);
    for (const letter of lettersIn(drawnOn(doc, baseline), subset))
      expect(held).toContain(letter);
    const again = await saved(doc);
    expect(lineAt(again, baseline)).toEqual([next]);
    for (const letter of lettersIn(drawnOn(again, baseline), subset))
      expect(held).toContain(letter);

    history.undo(doc);
    expect(run.text).toBe(original);
    expect(drawnOn(doc, baseline).map(restored)).toEqual(before.map(restored));
    history.redo(doc);
    expect(run.text).toBe(next);
    for (const letter of lettersIn(drawnOn(doc, baseline), subset))
      expect(held).toContain(letter);
  },
);

test("keeps a ligature whose letters the subset holds no glyphs of their own for, through an edit of its line, a save and an undo", async () => {
  const doc = await fixture("ligature-heading.pdf");
  const history = new HistoryStack();
  const heading = doc.page(0).runs.find((r) => r.text === "Article premier")!;
  const advance = ligatureAdvance(drawnOn(doc, heading.matrix.f))!;
  const ligature = (from: EditorDocument) =>
    expect(ligatureAdvance(drawnOn(from, heading.matrix.f))).toBeCloseTo(
      advance,
      1,
    );

  const { run, baseline } = typeOver(doc, history, "premier", "prime");

  expect(run.text).toBe("Article prime");
  ligature(doc);
  const again = await saved(doc);
  expect(lineAt(again, baseline)).toEqual(["Article prime"]);
  ligature(again);

  history.undo(doc);
  expect(run.text).toBe("Article premier");
  ligature(doc);
  expect(lineAt(await saved(doc), baseline)).toEqual(["Article premier"]);
  history.redo(doc);
  expect(run.text).toBe("Article prime");
  ligature(doc);
});

test.each([
  ["mushroom-life.pdf", "Spore", "Zqx 7", "Zqx 7 Stage"],
  ["mixed-style-sample.pdf", "reply", "Zqx", "Note: urgent Zqx needed soon."],
])(
  "keeps the spaces beside a word typed over one in %s",
  async (file, word, typed, expected) => {
    const doc = await fixture(file);
    const history = new HistoryStack();
    const singleSpaced = (texts: string[]) =>
      texts.map((text) => text.replace(/ +/g, " "));

    const { run, original, baseline } = typeOver(doc, history, word, typed);
    const before = lineAt(await fixture(file), baseline);

    expect(singleSpaced(lineAt(await saved(doc), baseline))).toEqual([
      expected,
    ]);

    history.undo(doc);
    expect(run.text).toBe(original);
    expect(lineAt(await saved(doc), baseline)).toEqual(before);
    history.redo(doc);
    expect(singleSpaced(lineAt(await saved(doc), baseline))).toEqual([
      expected,
    ]);
  },
);

test("redraws a paragraph line whose font draws no space when its first word is typed over, and puts the line back on undo", async () => {
  const doc = await fixture("mushroom-life.pdf");
  const history = new HistoryStack();
  const texts = (from: EditorDocument) => from.page(0).runs.map((r) => r.text);
  const before = texts(doc);
  const typedLine = async () =>
    texts(await saved(doc)).find((text) => text.includes("Zqx"));

  typeOver(doc, history, "Mushrooms", "Zqx");

  expect(await typedLine()).toMatch(/^Zqx represent one of nature/);

  history.undo(doc);
  expect(texts(await saved(doc))).toEqual(before);
  history.redo(doc);
  expect(await typedLine()).toMatch(/^Zqx represent one of nature/);
});
