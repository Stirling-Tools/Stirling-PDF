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

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/stirling-marketing.pdf",
);
const TAGLINE = "The Free Adobe Acrobat Alternative";
const EDITED = "The Free Adobe Acrobaaat Alternative";

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
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function tagline(doc: EditorDocument) {
  const run = doc.page(0).runs.find((r) => r.text.includes("Adobe"));
  if (!run) throw new Error("no tagline run");
  return run;
}

function pageText(doc: EditorDocument): string {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  try {
    return Array.from({ length: m.FPDFText_CountChars(textPage) }, (_, i) =>
      String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i)),
    ).join("");
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
}

function insertIntoAcrobat(history: HistoryStack, doc: EditorDocument) {
  const run = tagline(doc);
  expect(run.text).toBe(TAGLINE);
  const at = run.text.indexOf("Acrob") + "Acrob".length;
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: run.text.slice(0, at) + "aa" + run.text.slice(at),
    }),
    doc,
  );
}

test("a space drawn as its own object moves with the words a typed insert pushes along", async () => {
  const doc = await open();
  insertIntoAcrobat(new HistoryStack(), doc);

  expect(tagline(doc).text).toBe(EDITED);
  expect(pageText(doc)).toContain(EDITED);
});

test("the pushed space is saved after the word, not inside it", async () => {
  const doc = await open();
  insertIntoAcrobat(new HistoryStack(), doc);
  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );

  expect(tagline(saved).text).toBe(EDITED);
  expect(pageText(saved)).toContain(EDITED);
});

test("undo puts the space back where it was", async () => {
  const doc = await open();
  const before = pageText(doc);
  const history = new HistoryStack();
  insertIntoAcrobat(history, doc);
  history.undo(doc);

  expect(tagline(doc).text).toBe(TAGLINE);
  expect(pageText(doc)).toBe(before);
  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  expect(pageText(saved)).toBe(before);
});
