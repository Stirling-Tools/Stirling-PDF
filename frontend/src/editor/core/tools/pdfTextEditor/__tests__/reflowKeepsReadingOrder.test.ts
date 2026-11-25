// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const TYPED = " Pasted words here quick brown foxes jump";

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

const squash = (s: string) => s.replace(/\s+/g, "");

async function lineIn(file: string, index: number) {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, file))),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return { doc, run: doc.page(0).runs[index] };
}

// The reflow lays a line's objects out left to right, which is the reverse of
// how a right-to-left line reads, and splits a shaped cluster wherever its
// marks sit apart from their base. The run's text must still read as typed.
test.each([
  ["rtl-sample.pdf", 0],
  ["rtl-mixed-sample.pdf", 0],
  ["rtl-mixed-sample.pdf", 2],
  ["rtl-marks-sample.pdf", 0],
  ["rtl-marks-sample.pdf", 1],
  ["shaped-line-sample.pdf", 0],
  ["thai-line-sample.pdf", 0],
])(
  "wrapping typed line %s #%i keeps its letters in reading order",
  async (file, index) => {
    const { doc, run } = await lineIn(file, index);
    const original = run.text;
    const history = new HistoryStack();
    const typed = original + TYPED;
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: typed }),
      doc,
    );
    history.execute(
      new ReflowWrapCommand({ pageIndex: 0, runId: run.id, maxWidthPt: 90 }),
      doc,
    );
    expect(squash(run.text)).toBe(squash(typed));
    history.undo(doc);
    expect(run.text).toBe(original);
  },
);

// Once wrapped, an edit to a line of a shaping script redraws the letters left
// on that line from code points, which the edit refuses, so wrapping it would
// leave every later deletion on its first line refused.
test("typing past the box edge leaves a line that needs shaping unwrapped", async () => {
  const { doc, run } = await lineIn("shaped-line-sample.pdf", 0);
  const typed = run.text + TYPED;
  new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: typed }).apply(
    doc,
  );
  new ReflowWrapCommand({ pageIndex: 0, runId: run.id, maxWidthPt: 90 }).apply(
    doc,
  );
  expect(run.text).toBe(typed);
});
