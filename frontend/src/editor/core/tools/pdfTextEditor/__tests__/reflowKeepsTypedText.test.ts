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

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const HEADING = "Heading in a bigger size";

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, { headers: { "Content-Type": "application/wasm" } }),
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open() {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  const heading = page.runs.find((r) => r.text === HEADING)!;
  return { doc, heading };
}

// The overlay asks for a wrap on every keystroke that leaves a line past the
// box edge, so a reflow runs between keystrokes on a run it has already
// reflowed. Each one rebuilds the run's text from its objects.
test("a reflow between keystrokes keeps every letter typed since the last one", async () => {
  const { doc, heading } = await open();
  const history = new HistoryStack();
  let typed = HEADING;
  for (const ch of "gggggg") {
    typed += ch;
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: heading.id, nextText: typed }),
      doc,
    );
    history.execute(
      new ReflowWrapCommand({
        pageIndex: 0,
        runId: heading.id,
        maxWidthPt: 150,
      }),
      doc,
    );
    expect(heading.text.replace(/\s+/g, " ")).toBe(typed);
  }
  history.undo(doc);
  expect(heading.text).toBe(HEADING);
  history.redo(doc);
  expect(heading.text.replace(/\s+/g, " ")).toBe(typed);
});
