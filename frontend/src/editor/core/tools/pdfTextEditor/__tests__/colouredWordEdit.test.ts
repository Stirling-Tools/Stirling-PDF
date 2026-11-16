// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  openSample,
  sameColour,
  wordColours,
  wordFaces,
} from "@editor/tools/pdfTextEditor/__tests__/colouredWordFixture";

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
