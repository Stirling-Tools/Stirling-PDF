// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { parseOps } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { dictKeys, RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import {
  changedPixels,
  rasterFirstPage,
} from "@editor/tools/pdfTextEditor/__tests__/pageRaster";

const WIDTH = 612;
const HEIGHT = 792;

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
  for (const doc of opened.splice(0)) doc.dispose();
});

// Three lines, the top one drawn at 35% opacity when `translucent`.
function threeLines(translucent: boolean): Uint8Array {
  const top = translucent ? "q /GS gs " : "q ";
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Contents 4 0 R /Resources << /ExtGState << /GS 8 0 R >> /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>`,
      },
      {
        num: 4,
        body: streamBody(
          "",
          `${top}BT /F1 12 Tf 72 700 Td (Top line) Tj ET Q\nBT /F2 12 Tf 72 680 Td (Lower paragraph) Tj ET\nBT /F3 12 Tf 72 660 Td (Third paragraph) Tj ET`,
        ),
      },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      { num: 6, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>" },
      {
        num: 7,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
      },
      { num: 8, body: "<< /Type /ExtGState /ca 0.35 /CA 1 >>" },
    ],
    1,
  );
}

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

async function save(doc: EditorDocument): Promise<Uint8Array> {
  return new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
}

// Every graphics state the page names with `gs` that its resources lack.
async function undeclaredStates(bytes: Uint8Array): Promise<string[]> {
  const pdf = (await RawPdf.parse(bytes))!;
  const pageNum = pdf.pageNumberAt(0)!;
  const resources = pdf.pageInherited(pageNum, "Resources") ?? "<< >>";
  const states = pdf.resolve(resources, "ExtGState");
  const declared = new Set(states ? (dictKeys(states) ?? []) : []);
  const content = toLatin1((await pdf.pageContent(pageNum))!);
  return parseOps(content)
    .filter((op) => op.op === "gs")
    .map((op) => op.operands[0].slice(1))
    .filter((name) => !declared.has(name));
}

async function render(bytes: Uint8Array): Promise<Uint8Array> {
  return rasterFirstPage(await open(bytes), WIDTH, HEIGHT);
}

// Darkest pixel among the rows the top line is drawn on.
function darkestOnTopLine(pixels: Uint8Array): number {
  let darkest = 255;
  for (let y = HEIGHT - 712; y < HEIGHT - 696; y++)
    for (let x = 60; x < 260; x++)
      darkest = Math.min(darkest, pixels[(y * WIDTH + x) * 4]);
  return darkest;
}

test.each([
  ["translucent", true],
  ["opaque", false],
])(
  "%s text keeps its look and every graphics state it names across saves, undos and redos",
  async (_case, translucent) => {
    const doc = await open(threeLines(translucent));
    const top = doc.page(0).runs.find((r) => r.text === "Top line")!;
    const history = new HistoryStack();
    const edit = () =>
      new EditTextCommand({
        pageIndex: 0,
        runId: top.id,
        nextText: "Top line\nNew line",
      });
    history.execute(edit(), doc);
    history.breakCoalescing();

    const saves = [await save(doc)];
    for (let cycle = 0; cycle < 2; cycle++) {
      history.undo(doc);
      history.redo(doc);
      saves.push(await save(doc));
    }
    history.undo(doc);
    await save(doc);
    history.execute(edit(), doc);
    saves.push(await save(doc));

    const first = await render(saves[0]);
    if (translucent) expect(darkestOnTopLine(first)).toBeGreaterThan(120);
    for (const bytes of saves) {
      expect(await undeclaredStates(bytes)).toEqual([]);
      expect(changedPixels(first, await render(bytes))).toBe(0);
    }
  },
);
