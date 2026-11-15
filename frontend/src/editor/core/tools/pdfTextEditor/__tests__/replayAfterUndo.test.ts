// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { readObjFill } from "@editor/tools/pdfTextEditor/pdfium/PdfiumObjectColour";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const HEADING = "Heading in a bigger size";
const FPDF_PAGEOBJ_TEXT = 1;
const RED = { r: 220, g: 0, b: 0, a: 255 };

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

async function open(bytes?: Uint8Array) {
  const doc = await EditorDocument.open(
    bytes ?? new Uint8Array(await readFile(SAMPLE)),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function drawnText(doc: EditorDocument): string {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const buf = m.pdfium.wasmExports.malloc(1024);
  const textPage = m.FPDFText_LoadPage(pagePtr);
  let out = "";
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFTextObj_GetText(obj, textPage, buf, 1024);
      out += m.pdfium.UTF16ToString(buf);
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(buf);
  }
  // Objects a command draws go to the end of the page, so compare letters, not order.
  return [...out.replace(/\s+/g, "")].sort().join("");
}

function step(doc: EditorDocument, history: HistoryStack, cmd: Command) {
  history.execute(cmd, doc);
  history.breakCoalescing();
}

const family = (runId: string, nextFamily: string) =>
  new SetFontFamilyCommand({ pageIndex: 0, runId, nextFamily });

test("redoing two font changes draws the line once, on the page and in the saved file", async () => {
  const doc = await open();
  const heading = doc.page(0).runs.find((r) => r.text === HEADING)!;
  const once = drawnText(doc);
  const history = new HistoryStack();

  step(doc, history, family(heading.id, "Courier"));
  step(doc, history, family(heading.id, "Times-Roman"));
  history.undo(doc);
  history.undo(doc);
  history.redo(doc);
  history.redo(doc);

  expect(drawnText(doc)).toBe(once);
  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  expect(drawnText(saved)).toBe(once);
});

test.each([
  ["a font change", (id: string) => family(id, "Courier")],
  [
    "an outline",
    (id: string) =>
      new SetTextOutlineCommand({
        pageIndex: 0,
        runId: id,
        stroke: RED,
        width: 1,
      }),
  ],
])(
  "undoing a colour after redoing it over %s puts the drawn colour back",
  async (_case, before) => {
    const doc = await open();
    const heading = doc.page(0).runs.find((r) => r.text === HEADING)!;
    const history = new HistoryStack();

    step(doc, history, before(heading.id));
    step(
      doc,
      history,
      new SetColourCommand({ pageIndex: 0, runId: heading.id, nextFill: RED }),
    );
    history.undo(doc);
    history.undo(doc);
    history.redo(doc);
    history.redo(doc);
    history.undo(doc);

    for (const ptr of collectMemberPtrs(heading))
      expect(readObjFill(doc.module, ptr)?.r).toBe(0);
  },
);

test("redo keeps an edit made to a duplicated line", async () => {
  const doc = await open();
  const heading = doc.page(0).runs.find((r) => r.text === HEADING)!;
  const history = new HistoryStack();
  const duplicate = new DuplicateRunCommand({
    pageIndex: 0,
    runId: heading.id,
  });
  step(doc, history, duplicate);
  step(
    doc,
    history,
    new EditTextCommand({
      pageIndex: 0,
      runId: duplicate.insertedRunId!,
      nextText: "Changed copy",
    }),
  );

  history.undo(doc);
  history.undo(doc);
  history.redo(doc);
  history.redo(doc);

  expect(doc.page(0).findRun(duplicate.insertedRunId!)?.text).toBe(
    "Changed copy",
  );
});
