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
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";
import { readObjFill } from "@editor/tools/pdfTextEditor/pdfium/PdfiumObjectColour";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/coloured-word-sample.pdf",
);
// The sample sets its lines 15pt apart.
const LINE_PT = 15;

async function openSample(bytes?: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    bytes ?? new Uint8Array(await readFile(SAMPLE)),
  );
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

type Colour = "blue" | "black" | "other";
type Face = "bold" | "regular";

function colourOf(doc: EditorDocument, obj: number): Colour {
  const fill = readObjFill(doc.module, obj);
  if (!fill) return "other";
  if (fill.b > 150 && fill.r < 80) return "blue";
  if (Math.max(fill.r, fill.g, fill.b) < 60) return "black";
  return "other";
}

function faceOf(doc: EditorDocument, obj: number): Face {
  const m = doc.module;
  const font = m.FPDFTextObj_GetFont(obj);
  const len = m.FPDFFont_GetBaseFontName(font, 0, 0);
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    m.FPDFFont_GetBaseFontName(font, buf, len);
    return /bold/i.test(m.pdfium.UTF8ToString(buf)) ? "bold" : "regular";
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

interface DrawnChar {
  ch: string;
  x: number;
  line: number;
  c: Colour;
  face: Face;
}

// Each drawn letter of the page in reading order, by where it sits.
function drawnChars(doc: EditorDocument): DrawnChar[] {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const xy = m.pdfium.wasmExports.malloc(16);
  const chars: DrawnChar[] = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      const ch = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (!/\S/.test(ch)) continue;
      m.FPDFText_GetCharOrigin(textPage, i, xy, xy + 8);
      const obj = m.FPDFText_GetTextObject(textPage, i);
      chars.push({
        ch,
        x: m.pdfium.getValue(xy, "double"),
        line: Math.round(m.pdfium.getValue(xy + 8, "double") / LINE_PT),
        c: colourOf(doc, obj),
        face: faceOf(doc, obj),
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(xy);
  }
  return chars.sort((a, b) => b.line - a.line || a.x - b.x);
}

function drawnWord(doc: EditorDocument, word: string): DrawnChar[] {
  const chars = drawnChars(doc);
  const at = chars
    .map(({ ch }) => ch)
    .join("")
    .indexOf(word);
  expect(at, `"${word}" is drawn`).toBeGreaterThanOrEqual(0);
  return chars.slice(at, at + word.length);
}

const wordColours = (doc: EditorDocument, word: string): Colour[] =>
  drawnWord(doc, word).map(({ c }) => c);

const wordFaces = (doc: EditorDocument, word: string): Face[] =>
  drawnWord(doc, word).map(({ face }) => face);

const sameColour = (c: Colour, n: number) => Array<Colour>(n).fill(c);

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
  const doc = await openSample(bytes);
  opened.push(doc);
  return doc;
}

function typeAt(
  history: HistoryStack,
  doc: EditorDocument,
  needle: string,
  at: number,
) {
  const run = doc.page(0).runs.find((r) => r.text.includes(needle))!;
  const i = run.text.indexOf(needle) + at;
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: run.text.slice(0, i) + "Q" + run.text.slice(i),
    }),
    doc,
  );
}

test("the fixture has a paragraph, a single line and a Hebrew line, each with blue words", async () => {
  const doc = await open();
  const runs = doc.page(0).runs.filter((r) => r.text.trim());
  expect(runs).toHaveLength(3);
  expect(runs.find((r) => r.text.includes("Scotland"))!.text).toContain("\n");
  expect(wordColours(doc, "Scotland")).toEqual(sameColour("blue", 8));
  expect(wordColours(doc, "Totaldue")).toEqual(sameColour("black", 8));
  expect(wordColours(doc, "today")).toEqual(sameColour("blue", 5));
});

test.each([
  ["at the end of a line", "Scotland", 8, "Scotland", "ScotlandQ", "blue"],
  ["mid-word", "Helpdesk", 4, "Helpdesk", "HelpQdesk", "blue"],
  ["at the start of a word", "Helpdesk", 0, "Helpdesk", "QHelpdesk", "blue"],
  ["mid-word on a single line", "today", 2, "today", "toQday", "blue"],
  [
    "after a black word beside a blue one",
    "call the",
    8,
    "callthe",
    "theQ",
    "black",
  ],
  [
    "after a black word on a single line",
    "due",
    3,
    "Totaldue",
    "dueQ",
    "black",
  ],
] as const)(
  "a letter typed %s takes the colour of the word it joins, through undo, redo and save",
  async (_name, needle, at, original, word, colour) => {
    const doc = await open();
    const history = new HistoryStack();

    typeAt(history, doc, needle, at);
    expect(wordColours(doc, word)).toEqual(sameColour(colour, word.length));

    history.undo(doc);
    expect(wordColours(doc, original)).toEqual(
      sameColour(colour, original.length),
    );
    history.redo(doc);
    expect(wordColours(doc, word)).toEqual(sameColour(colour, word.length));

    const saved = await open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    expect(wordColours(saved, word)).toEqual(sameColour(colour, word.length));
    expect(wordFaces(saved, word)).toEqual(
      Array(word.length).fill(colour === "blue" ? "bold" : "regular"),
    );
    expect(wordColours(saved, "team")).toEqual(sameColour("black", 4));
    expect(wordColours(saved, "Scotland")).toEqual(sameColour("blue", 8));
  },
);

test("an undo that redraws the pieces an edit removed draws each in its own colour", async () => {
  const doc = await open();
  const m = doc.module;
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text.includes("today"))!;
  const tags = uniformTags(run.tagMarks);
  const prev = {
    fonts: run.mergedFromPtrs.map((ptr) => m.FPDFTextObj_GetFont(ptr)),
    fills: run.mergedFromPtrs.map((ptr) => readObjFill(m, ptr)),
    charStarts: [...run.mergedFromCharStarts],
    baselineY: run.matrix.f,
    fontSubset: run.fontSubset,
  };
  const i = run.text.indexOf("today") + 2;
  const plan = planPartialEdit(
    run,
    run.text,
    run.text.slice(0, i) + "Q" + run.text.slice(i),
  )!;
  expect(plan.removePtrs.length).toBeGreaterThan(0);
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

  expect(redrawn?.size).toBeGreaterThan(0);
  expect(wordColours(doc, "today")).toEqual(sameColour("blue", 5));
  expect(wordColours(doc, "Totaldue")).toEqual(sameColour("black", 8));
});

test.each([
  ["an Enter before a blue word", "call the ", "call the\n"],
  ["an Enter after a blue word", "Helpdesk ", "Helpdesk\n"],
  ["an edit spanning two lines", "Scotland\ncall", "ScotlandQ\nQcall"],
])(
  "after %s, every redrawn word keeps its own colour and face, through undo and save",
  async (_name, from, to) => {
    const doc = await open();
    const history = new HistoryStack();
    const run = doc.page(0).runs.find((r) => r.text.includes("Scotland"))!;
    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.replace(from, to),
      }),
      doc,
    );
    const check = (d: EditorDocument) => {
      expect(wordColours(d, "Helpdesk")).toEqual(sameColour("blue", 8));
      expect(wordFaces(d, "Helpdesk")).toEqual(Array(8).fill("bold"));
      expect(wordColours(d, "Scotland")).toEqual(sameColour("blue", 8));
      expect(wordColours(d, "team")).toEqual(sameColour("black", 4));
      expect(wordFaces(d, "team")).toEqual(Array(4).fill("regular"));
      expect(wordColours(d, "callthe").slice(-3)).toEqual(
        sameColour("black", 3),
      );
    };
    check(doc);
    check(
      await open(new Uint8Array(await (await exportToBlob(doc)).arrayBuffer())),
    );
    history.undo(doc);
    check(doc);
  },
);

// Hebrew is drawn right to left, so its letters read backwards along the page.
const drawnLeftToRight = (word: string) => [...word].reverse().join("");

test.each([
  ["inside the blue word", "שלום", 2, "שללום", "blue"],
  ["after a black word", "הטלפון", 6, "הטלפוןל", "black"],
] as const)(
  "a letter typed into a right-to-left line %s takes that word's colour, through undo and save",
  async (_name, needle, at, word, colour) => {
    const doc = await open();
    const history = new HistoryStack();
    const run = doc.page(0).runs.find((r) => r.text.includes(needle))!;
    const i = run.text.indexOf(needle) + at;
    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.slice(0, i) + "ל" + run.text.slice(i),
      }),
      doc,
    );
    const drawn = drawnLeftToRight(word);
    expect(wordColours(doc, drawn)).toEqual(sameColour(colour, word.length));
    const saved = await open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    expect(wordColours(saved, drawn)).toEqual(sameColour(colour, word.length));
    history.undo(doc);
    expect(wordColours(doc, drawnLeftToRight("שלום"))).toEqual(
      sameColour("blue", 4),
    );
  },
);

test("a right-to-left edit still draws after other documents were edited and closed", async () => {
  for (const [from, to] of [
    ["call the ", "call the\n"],
    ["Scotland\ncall", "ScotlandQ\nQcall"],
  ]) {
    const doc = await openSample();
    const history = new HistoryStack();
    const run = doc.page(0).runs.find((r) => r.text.includes("Scotland"))!;
    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.replace(from, to),
      }),
      doc,
    );
    const saved = await openSample(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    history.undo(doc);
    doc.dispose();
    saved.dispose();
  }

  const doc = await open();
  const run = doc.page(0).runs.find((r) => r.text.includes("שלום"))!;
  const i = run.text.indexOf("שלום") + 2;
  new HistoryStack().execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: run.text.slice(0, i) + "ל" + run.text.slice(i),
    }),
    doc,
  );
  expect(wordColours(doc, drawnLeftToRight("שללום"))).toEqual(
    sameColour("blue", 5),
  );
});
