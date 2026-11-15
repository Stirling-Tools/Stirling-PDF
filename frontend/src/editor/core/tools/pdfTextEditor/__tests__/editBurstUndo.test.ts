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
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const HEADING = "Heading in a bigger size";
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

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

// The heading line as drawn: the model can be right while undone objects still paint.
function piecesOnHeadingLine(
  doc: EditorDocument,
  headingId: string,
): Array<{ left: number; text: string }> {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const heading = doc.page(0).runs.find((r) => r.id === headingId)!;
  const box = m.pdfium.wasmExports.malloc(16);
  const text = m.pdfium.wasmExports.malloc(1024);
  const textPage = m.FPDFText_LoadPage(pagePtr);
  const pieces: Array<{ left: number; text: string }> = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      if (!m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12))
        continue;
      const bottom = m.pdfium.getValue(box + 4, "float");
      if (Math.abs(bottom - heading.bounds.y) > heading.bounds.height) continue;
      m.FPDFTextObj_GetText(obj, textPage, text, 1024);
      pieces.push({
        left: m.pdfium.getValue(box, "float"),
        text: m.pdfium.UTF16ToString(text),
      });
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(box);
    m.pdfium.wasmExports.free(text);
  }
  return pieces.sort((a, b) => a.left - b.left);
}

function drawnOnHeadingLine(doc: EditorDocument, headingId: string): string {
  return piecesOnHeadingLine(doc, headingId)
    .map((p) => p.text)
    .join("")
    .replace(/\s+/g, "");
}

// Edits back to back, inside the history's merge window.
function burst(
  doc: EditorDocument,
  history: HistoryStack,
  headingId: string,
  texts: string[],
) {
  for (const nextText of texts)
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: headingId, nextText }),
      doc,
    );
}

const squashed = (text: string) => text.replace(/\s+/g, "");

describe("undoing a burst of edits to one line", () => {
  const steps = [
    `${HEADING} Zq7`,
    `Xk ${HEADING} Zq7`,
    `Xk Heading Wj9 in a bigger size Zq7`,
    `Xk Heading Wj9 ina bigger size Zq7`,
    `Xk Heading Wj9 ina Quixotic size Zq7`,
    `Xk Heading Wj9 ina Quixotic size Zq`,
  ];
  const final = steps[steps.length - 1];

  test("leaves nothing typed on the page, and redo draws it once", async () => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
    const headingId = run.id;
    const history = new HistoryStack();

    burst(doc, history, headingId, steps);
    expect(history.size().undo).toBe(1);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(final));

    history.undo(doc);
    expect(run.text).toBe(HEADING);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(HEADING));

    history.redo(doc);
    expect(run.text).toBe(final);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(final));

    history.undo(doc);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(HEADING));
  });

  test.each([
    ["a burst", 1],
    ["separate edits", 2],
  ])("leaves the edit before %s undoable", async (_case, undoSteps) => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
    const headingId = run.id;
    const history = new HistoryStack();

    burst(doc, history, headingId, [`${HEADING} Zq7`]);
    history.breakCoalescing();
    burst(doc, history, headingId, [`${HEADING} Wj9`]);
    if (undoSteps > 1) history.breakCoalescing();
    burst(doc, history, headingId, [`${HEADING} Wj90`]);
    expect(history.size().undo).toBe(1 + undoSteps);
    for (let i = 0; i < undoSteps; i++) history.undo(doc);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(`${HEADING} Zq7`));
    history.undo(doc);

    expect(run.text).toBe(HEADING);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(HEADING));
  });

  test.each([
    [`Xk ${HEADING}`, [HEADING, `${HEADING} Q`]],
    [`Xk Yz ${HEADING}`, [`Yz ${HEADING}`, `Yz ${HEADING}!`]],
  ])(
    "puts back the spacing a burst deleting the first piece of %s shifted",
    async (start, steps) => {
      const doc = await open();
      const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
      const history = new HistoryStack();
      burst(doc, history, run.id, [start]);
      history.breakCoalescing();
      const pieces = piecesOnHeadingLine(doc, run.id);

      burst(doc, history, run.id, steps);
      history.undo(doc);

      const restored = piecesOnHeadingLine(doc, run.id);
      expect(restored.map((p) => p.text)).toEqual(pieces.map((p) => p.text));
      restored.forEach((piece, i) =>
        expect(piece.left).toBeCloseTo(pieces[i].left, 0),
      );
    },
  );

  test.each([
    [["Heading in a bigger siz", "Heading in a bigger si"]],
    [["Heading in a Qbigger size", "Heading in a QQbigger size"]],
  ])("puts the line back in its own font after %j", async (steps) => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
    const font = run.fontId;
    const history = new HistoryStack();

    burst(doc, history, run.id, steps);
    history.undo(doc);
    expect(run.fontId).toBe(font);
    history.redo(doc);
    history.undo(doc);

    expect(run.fontId).toBe(font);
  });

  test("puts the line back where it started", async () => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
    const headingId = run.id;
    const left = piecesOnHeadingLine(doc, headingId)[0].left;
    const history = new HistoryStack();

    burst(doc, history, headingId, steps);
    history.undo(doc);

    expect(piecesOnHeadingLine(doc, headingId)[0].left).toBeCloseTo(left, 0);
  });
});

describe("undoing one edit that removed a piece of the line", () => {
  test.each([
    ["deleting", HEADING],
    ["replacing", `${HEADING} Wj9`],
  ])("puts back the piece after %s it", async (_change, nextText) => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
    const headingId = run.id;
    const left = piecesOnHeadingLine(doc, headingId)[0].left;
    const edit = (text: string) =>
      new EditTextCommand({ pageIndex: 0, runId: headingId, nextText: text });
    edit(`${HEADING} Zq7`).apply(doc);
    const pieces = [...run.mergedFromTexts];
    const change = edit(nextText);

    change.apply(doc);
    change.revert(doc);

    expect(run.mergedFromTexts).toEqual(pieces);
    expect(drawnOnHeadingLine(doc, headingId)).toBe(squashed(`${HEADING} Zq7`));
    expect(piecesOnHeadingLine(doc, headingId)[0].left).toBeCloseTo(left, 0);
  });
});
