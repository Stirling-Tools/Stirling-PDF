// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { DeleteShapeCommand } from "@editor/tools/pdfTextEditor/commands/DeleteShapeCommand";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { FillTableCellCommand } from "@editor/tools/pdfTextEditor/commands/FillTableCellCommand";
import { ModifyTableCommand } from "@editor/tools/pdfTextEditor/commands/ModifyTableCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TableModel } from "@editor/tools/pdfTextEditor/model/TableModel";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { adoptedTableModel } from "@editor/tools/pdfTextEditor/util/tableAdoption";
import { detectTables } from "@editor/tools/pdfTextEditor/util/tableDetection";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const CELLS = [
  ["Item", "Qty", "Price"],
  ["Widget 1", "10.10", "13.20"],
  ["Widget 2", "17.10", "20.20"],
  ["Widget 3", "24.10", "27.20"],
];
const LEFT = 72;
const TOP = 700;
const COL_WIDTH = 100;
const ROW_HEIGHT = 20;
const BADGE = { x: 420, y: 650, width: 60, height: 30 };

// Every cell draws its own borders, as an exported table does, so the page holds far more rule objects than the grid the editor redraws.
function borderedTablePdf(): Uint8Array {
  const rules: string[] = [];
  const texts: string[] = [];
  CELLS.forEach((row, r) => {
    const y = TOP - (r + 1) * ROW_HEIGHT;
    row.forEach((text, c) => {
      const x = LEFT + c * COL_WIDTH;
      rules.push(
        `${x} ${y} 1 ${ROW_HEIGHT} re f`,
        `${x} ${y} ${COL_WIDTH} 1 re f`,
        `${x} ${y + ROW_HEIGHT} ${COL_WIDTH} 1 re f`,
        `${x + COL_WIDTH} ${y} 1 ${ROW_HEIGHT} re f`,
      );
      texts.push(`BT /F1 9 Tf ${x + 4} ${y + 6} Td (${text}) Tj ET`);
    });
  });
  const badge = `0.9 0.2 0.2 rg ${BADGE.x} ${BADGE.y} ${BADGE.width} ${BADGE.height} re f`;
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /Font << /F1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody("", `${[...rules, ...texts, badge].join("\n")}\n`),
      },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

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

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

async function saved(doc: EditorDocument): Promise<EditorDocument> {
  return open(new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()));
}

const texts = (doc: EditorDocument): string[] =>
  doc
    .page(0)
    .runs.flatMap((run) => run.text.split("\n"))
    .map((text) => text.trim())
    .filter(Boolean)
    .sort();

function adoptTable(doc: EditorDocument): TableModel {
  const page = doc.page(0);
  const [table] = detectTables(
    page.runs.map((run) => run.snapshot()),
    0,
    {},
    page.rules,
  );
  const model = adoptedTableModel(doc.module, page, table);
  page.tables = [...page.tables, model];
  return model;
}

function step(doc: EditorDocument, history: HistoryStack, cmd: Command): void {
  history.execute(cmd, doc);
  history.breakCoalescing();
}

function addFilledRow(
  doc: EditorDocument,
  history: HistoryStack,
  model: TableModel,
): void {
  const row = model.rows;
  step(
    doc,
    history,
    new ModifyTableCommand({ tableId: model.id, op: "add-row", index: row }),
  );
  step(
    doc,
    history,
    new FillTableCellCommand({
      tableId: model.id,
      row,
      col: 0,
      text: "NewCell",
    }),
  );
}

test("a text edit made before a table row was added can be undone, redone and saved", async () => {
  const doc = await open(borderedTablePdf());
  const original = texts(doc);
  const item = doc.page(0).runs.find((run) => run.text.startsWith("Item"))!;
  const typed = `${item.text}Zq`;
  const history = new HistoryStack();

  step(
    doc,
    history,
    new EditTextCommand({ pageIndex: 0, runId: item.id, nextText: typed }),
  );
  const model = adoptTable(doc);
  expect(model.ruled).toBe(true);
  const objectsBeforeRow = doc.module.FPDFPage_CountObjects(
    doc.page(0).pagePtr,
  );
  addFilledRow(doc, history, model);
  expect(doc.module.FPDFPage_CountObjects(doc.page(0).pagePtr)).toBeLessThan(
    objectsBeforeRow - CELLS.length,
  );

  history.undo(doc);
  history.undo(doc);
  history.undo(doc);

  expect(history.size()).toEqual({ undo: 0, redo: 3 });
  expect(texts(doc)).toEqual(original);
  expect(texts(await saved(doc))).toEqual(original);

  history.redo(doc);
  history.redo(doc);
  history.redo(doc);

  const edited = texts(await saved(doc));
  expect(edited).toContain(typed);
  expect(edited).toContain("NewCell");
  expect(texts(await saved(doc))).toEqual(edited);
});

test("a shape deleted before a table row was added comes back on undo", async () => {
  const doc = await open(borderedTablePdf());
  const page = doc.page(0);
  const badge = page.shapes.find(
    (shape) => Math.abs(shape.bounds.x - BADGE.x) < 1,
  )!;
  const history = new HistoryStack();

  step(
    doc,
    history,
    new DeleteShapeCommand({ pageIndex: 0, shapeId: badge.id }),
  );
  addFilledRow(doc, history, adoptTable(doc));
  history.undo(doc);
  history.undo(doc);
  history.undo(doc);

  expect(page.findShape(badge.id)).toBe(badge);
  const reopened = await saved(doc);
  expect(
    reopened
      .page(0)
      .shapes.some((shape) => Math.abs(shape.bounds.x - BADGE.x) < 1),
  ).toBe(true);
});
