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
// Lines here are 14pt apart; a glyph sticking above its line stays well inside this.
const LINE_SLACK_PT = 4;

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

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

interface Piece {
  left: number;
  label: string;
}

// Each drawn piece on the line of the object holding `needle`, left to right, as "text@font".
function placedPieces(doc: EditorDocument, needle: string): Piece[] {
  const m = doc.module;
  const page = doc.page(0);
  const box = m.pdfium.wasmExports.malloc(16);
  const text = m.pdfium.wasmExports.malloc(512);
  const name = m.pdfium.wasmExports.malloc(256);
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  const pieces: Array<Piece & { top: number; text: string }> = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(page.pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(page.pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12);
      m.FPDFTextObj_GetText(obj, textPage, text, 512);
      m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(obj), name, 256);
      const font = m.pdfium.UTF8ToString(name).replace(/^[A-Z]{6}\+/, "");
      const content = m.pdfium.UTF16ToString(text);
      pieces.push({
        left: m.pdfium.getValue(box, "float"),
        top: m.pdfium.getValue(box + 12, "float"),
        text: content,
        label: `${content.trim()}@${font}`,
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(box);
    m.pdfium.wasmExports.free(text);
    m.pdfium.wasmExports.free(name);
  }
  const anchor = pieces.find((p) => p.text.includes(needle))!;
  return pieces
    .filter((p) => Math.abs(p.top - anchor.top) <= LINE_SLACK_PT)
    .sort((a, b) => a.left - b.left);
}

function pageText(doc: EditorDocument): string {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  try {
    let text = "";
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++)
      text += String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
    return text.replace(/\s+/g, " ");
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
}

function piecesOnLine(doc: EditorDocument, needle: string): string[] {
  return placedPieces(doc, needle).map((p) => p.label);
}

function typeInto(
  doc: EditorDocument,
  needle: string,
  at: number,
  add: string,
) {
  const run = doc.page(0).runs.find((r) => r.text.includes(needle))!;
  const i = run.text.indexOf(needle) + at;
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: run.text.slice(0, i) + add + run.text.slice(i),
  }).apply(doc);
}

describe("typing inside a word of a line that mixes styles", () => {
  test.each([
    ["bold", "boXkld", /-Bold$/],
    ["italic", "itXkalic", /-(Italic|Oblique)$/],
    ["both", "boXkth", /-Bold(Italic|Oblique)$/],
  ])(
    "keeps every word in its own face after typing in %s",
    async (word, edited, face) => {
      const doc = await open();
      const before = piecesOnLine(doc, "Plain");

      typeInto(doc, word, 2, "Xk");

      const after = piecesOnLine(doc, "Plain");
      // The subset holds only the glyphs the word used, so typed letters it lacks come from a font of the same style.
      const typed = after.find((p) => p.startsWith(`${edited}@`));
      expect(typed?.split("@")[1]).toMatch(face);
      const wordFonts = (pieces: string[]) =>
        pieces.flatMap((p) => {
          const [text, font] = p.split("@");
          return text.split(/\s+/).map((w) => `${w}@${font}`);
        });
      const untouched = wordFonts(before).filter(
        (w) => !w.startsWith(`${word}@`),
      );
      expect(wordFonts(after)).toEqual(expect.arrayContaining(untouched));
    },
  );
});

describe("typing inside a word of a single line that mixes styles", () => {
  test.each([
    ["urgent", "urXkgent", /-Bold$/],
    ["needed", "neXkeded", /-(Italic|Oblique)$/],
  ])(
    "keeps every word in its own face after typing in %s",
    async (word, edited, face) => {
      const doc = await open();
      const run = doc.page(0).runs.find((r) => r.text.includes("Note:"))!;
      expect(run.paragraphLineSlots.length).toBeLessThan(2);
      const before = piecesOnLine(doc, "Note:");

      typeInto(doc, word, 2, "Xk");

      const after = piecesOnLine(doc, "Note:");
      const typed = after.find((p) => p.startsWith(`${edited}@`));
      expect(typed?.split("@")[1]).toMatch(face);
      const others = before
        .filter((p) => !p.startsWith(`${word}@`))
        .map((p) => p.split("@")[1]);
      for (const font of others)
        expect(after.some((p) => p.endsWith(`@${font}`))).toBe(true);
    },
  );
});

describe("typing a word into a mixed line one letter at a time", () => {
  test.each([["Note:"], ["Plain"]])(
    "keeps the other words' faces on the line starting %s",
    async (needle) => {
      const doc = await open();
      const word = needle === "Note:" ? "urgent" : "bold";
      const fontsBefore = new Set(
        piecesOnLine(doc, needle).map((p) => p.split("@")[1]),
      );

      typeInto(doc, word, 2, "X");
      typeInto(doc, `${word.slice(0, 2)}X`, 3, "k");

      const fontsAfter = new Set(
        piecesOnLine(doc, needle).map((p) => p.split("@")[1]),
      );
      for (const font of fontsBefore)
        if (!/-Bold$/.test(font)) expect(fontsAfter).toContain(font);
      expect([...fontsAfter].some((f) => /-Bold$/.test(f))).toBe(true);
    },
  );
});

describe("redrawing one piece of a mixed line", () => {
  test("keeps the symbols it holds and moves the next piece only by the typed letter", async () => {
    const doc = await open();
    const checkBefore = placedPieces(doc, "Ratio").find((p) =>
      p.label.startsWith("✓"),
    )!;

    typeInto(doc, "b →", 1, "X");

    const after = placedPieces(doc, "Ratio");
    const labels = after.map((p) => p.label);
    for (const kept of ["Ratio", "a", "≥", "→", "c,", "done"])
      expect(labels).toContain(`${kept}@LiberationSans`);
    const shift =
      after.find((p) => p.label.startsWith("✓"))!.left - checkBefore.left;
    // Helvetica's X at the line's 12pt is 8pt wide; anything near twice that is a doubled space.
    expect(shift).toBeGreaterThan(6);
    expect(shift).toBeLessThan(10);
  });

  test("keeps the word where it started while letters are typed into it", async () => {
    const doc = await open();
    const leftOf = () =>
      placedPieces(doc, "Plain").find((p) => /^bo/.test(p.label))!.left;
    const start = leftOf();

    typeInto(doc, "bold", 2, "X");
    typeInto(doc, "boX", 3, "k");

    expect(leftOf()).toBeCloseTo(start, 1);
  });
});

describe("undoing an edit that redrew pieces of a mixed line", () => {
  test.each([
    ["Ratio", "b →", 1],
    ["Note:", "urgent", 2],
    ["Plain", "bold", 2],
  ])(
    "puts the line starting %s back exactly and redoes it the same way",
    async (needle, word, at) => {
      const doc = await open();
      const history = new HistoryStack();
      const drawn = () =>
        placedPieces(doc, needle).map(({ label, left }) => ({
          label,
          left: Math.round(left * 10) / 10,
        }));
      const original = drawn();
      const run = doc.page(0).runs.find((r) => r.text.includes(word))!;
      const i = run.text.indexOf(word) + at;

      history.execute(
        new EditTextCommand({
          pageIndex: 0,
          runId: run.id,
          nextText: run.text.slice(0, i) + "Xk" + run.text.slice(i),
        }),
        doc,
      );
      const edited = drawn();
      history.undo(doc);

      expect(drawn()).toEqual(original);
      history.redo(doc);
      expect(drawn()).toEqual(edited);
    },
  );
});

describe("a line with superscripts and subscripts", () => {
  test("reads them as part of the line, in place", async () => {
    const doc = await open();

    expect(doc.page(0).runs.map((r) => r.text)).toContain(
      "Water is H2O and area is x2 plus y3.",
    );
  });

  test("moves them with their words when text is typed before them", async () => {
    const doc = await open();
    const scripts = () =>
      placedPieces(doc, "plus").filter((p) => /^[23]@/.test(p.label));
    const before = scripts();

    typeInto(doc, "is H", 0, "XYZ ");

    const after = scripts();
    expect(after).toHaveLength(before.length);
    const shifts = after.map((p, i) => p.left - before[i].left);
    for (const shift of shifts) expect(shift).toBeCloseTo(shifts[0], 0);
    expect(shifts[0]).toBeGreaterThan(20);
  });
});

describe("the page's reading order after an edit", () => {
  test("reads an edited line in place, and exactly as before once undone", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const original = pageText(doc);
    const run = doc.page(0).runs.find((r) => r.text.includes("Water"))!;
    const i = run.text.indexOf("is H");

    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.slice(0, i) + "XYZ " + run.text.slice(i),
      }),
      doc,
    );

    expect(pageText(doc)).toContain("Water XYZ is H");
    expect(pageText(doc).indexOf("Water")).toBe(original.indexOf("Water"));
    history.undo(doc);
    expect(pageText(doc)).toBe(original);
  });
});
