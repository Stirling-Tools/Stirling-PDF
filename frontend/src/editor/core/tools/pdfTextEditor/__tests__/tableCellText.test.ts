// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { FillTableCellCommand } from "@editor/tools/pdfTextEditor/commands/FillTableCellCommand";
import { InsertTableCommand } from "@editor/tools/pdfTextEditor/commands/InsertTableCommand";
import { cellTextDrawable } from "@editor/tools/pdfTextEditor/commands/tableHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { preloadFallbackFontBytes } from "@editor/tools/pdfTextEditor/util/fallbackFont";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const FALLBACK_FONT = path.join(
  import.meta.dirname,
  "../../../../../../public/fonts/NotoSans-Regular.ttf",
);
const CYRILLIC = "Привет мир";

const opened: EditorDocument[] = [];
let serveFallbackFont = false;

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  const font = await readFile(FALLBACK_FONT);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith(".wasm"))
        return new Response(wasm, {
          headers: { "Content-Type": "application/wasm" },
        });
      if (serveFallbackFont && String(url).endsWith("NotoSans-Regular.ttf"))
        return new Response(font);
      return new Response(null, { status: 404 });
    }),
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

async function withTable() {
  const doc = await open();
  const history = new HistoryStack();
  const insert = new InsertTableCommand({
    pageIndex: 0,
    x: 72,
    y: 200,
    width: 300,
    height: 60,
    rows: 2,
    cols: 2,
  });
  history.execute(insert, doc);
  history.breakCoalescing();
  const tableId = insert.insertedTableId!;
  const fill = (text: string, col = 0) => {
    const cmd = new FillTableCellCommand({ tableId, row: 0, col, text });
    history.execute(cmd, doc);
    history.breakCoalescing();
    return cmd;
  };
  return { doc, history, fill };
}

async function savedTexts(doc: EditorDocument): Promise<string[]> {
  const reopened = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  return reopened.page(0).runs.map((run) => run.text.trim());
}

// Runs first: once the fallback face has loaded it stays loaded for the file.
test.each([CYRILLIC, "Total я", "日本語"])(
  "a new cell refuses %s whole while no loaded font draws it",
  async (text) => {
    const { doc, fill } = await withTable();
    const runs = doc.page(0).runs.length;

    expect(cellTextDrawable(text)).toBe(false);
    expect(fill(text).insertedRunId).toBeNull();

    expect(doc.page(0).runs).toHaveLength(runs);
    expect(doc.page(0).tables[0].cellRuns[0][0]).toBeNull();
  },
);

test("a new cell draws letters outside the standard fonts in the fallback face, and they are saved", async () => {
  serveFallbackFont = true;
  await preloadFallbackFontBytes();
  const { doc, history, fill } = await withTable();
  const before = await savedTexts(doc);

  expect(cellTextDrawable(CYRILLIC)).toBe(true);
  expect(cellTextDrawable("日本語")).toBe(false);
  const runId = fill(CYRILLIC).insertedRunId!;
  expect(fill("Total я", 1).insertedRunId).not.toBeNull();
  expect(doc.page(0).findRun(runId)?.text).toBe(CYRILLIC);
  expect(await savedTexts(doc)).toEqual(
    expect.arrayContaining([CYRILLIC, "Total я"]),
  );

  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId,
      nextText: `${CYRILLIC}!`,
    }),
    doc,
  );
  expect(await savedTexts(doc)).toContain(`${CYRILLIC}!`);

  history.undo(doc);
  history.undo(doc);
  history.undo(doc);
  expect(await savedTexts(doc)).toEqual(before);

  history.redo(doc);
  history.redo(doc);
  history.redo(doc);
  const redone = await savedTexts(doc);
  expect(redone).toEqual(expect.arrayContaining([`${CYRILLIC}!`, "Total я"]));
  expect(await savedTexts(doc)).toEqual(redone);
});
