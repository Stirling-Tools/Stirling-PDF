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

// What the page draws on the heading's line, left to right: the model's text
// can be right while objects from an undone edit are still painted.
function piecesOnHeadingLine(
  doc: EditorDocument,
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
      if (m.FPDFPageObj_GetType(obj) !== 1) continue;
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

function drawnOnHeadingLine(doc: EditorDocument): string {
  return piecesOnHeadingLine(doc)
    .map((p) => p.text)
    .join("")
    .replace(/\s+/g, "");
}

let headingId = "";

// Each edit runs straight after the last, inside the history's merge window,
// as quick edits at different places on one line do.
function burst(doc: EditorDocument, history: HistoryStack, texts: string[]) {
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
    headingId = run.id;
    const history = new HistoryStack();

    burst(doc, history, steps);
    expect(history.size().undo).toBe(1);
    expect(drawnOnHeadingLine(doc)).toBe(squashed(final));

    history.undo(doc);
    expect(run.text).toBe(HEADING);
    expect(drawnOnHeadingLine(doc)).toBe(squashed(HEADING));

    history.redo(doc);
    expect(run.text).toBe(final);
    expect(drawnOnHeadingLine(doc)).toBe(squashed(final));

    history.undo(doc);
    expect(drawnOnHeadingLine(doc)).toBe(squashed(HEADING));
  });

  test("puts the line back where it started", async () => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
    headingId = run.id;
    const left = piecesOnHeadingLine(doc)[0].left;
    const history = new HistoryStack();

    burst(doc, history, steps);
    history.undo(doc);

    expect(piecesOnHeadingLine(doc)[0].left).toBeCloseTo(left, 0);
  });
});
