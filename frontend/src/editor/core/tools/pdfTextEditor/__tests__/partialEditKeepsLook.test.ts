// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { rasterFirstPage } from "@editor/tools/pdfTextEditor/__tests__/pageRaster";

const HEADING = "Quarterly report heading";
const PAGE_W = 612;
const PAGE_H = 792;
const BASELINE = 700;

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

function pdf(content: string, font: string): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
      },
      { num: 4, body: streamBody("", content) },
      { num: 5, body: font },
    ],
    1,
  );
}

const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
const KERNED = `[(Qua) 60 (rterly) -40 ( report heading)] TJ`;

// Every letter 0.05 em wide, under the width an in-place edit is trusted to draw.
const NARROW_HELVETICA = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${Array(95).fill(50).join(" ")}] >>`;

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function inkedRows(doc: EditorDocument, fromY: number, toY: number): number {
  const pixels = rasterFirstPage(doc, PAGE_W, PAGE_H, false);
  let rows = 0;
  for (let y = fromY; y < toY; y++) {
    const row = PAGE_H - 1 - y;
    for (let x = 0; x < PAGE_W; x++) {
      if (pixels[(row * PAGE_W + x) * 4] < 128) {
        rows++;
        break;
      }
    }
  }
  return rows;
}

function originsOf(doc: EditorDocument): Array<{ char: string; x: number }> {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const at = m.pdfium.wasmExports.malloc(16);
  try {
    return Array.from({ length: m.FPDFText_CountChars(textPage) }, (_, i) => {
      m.FPDFText_GetCharOrigin(textPage, i, at, at + 8);
      return {
        char: String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i)),
        x: m.pdfium.getValue(at, "double"),
      };
    });
  } finally {
    m.pdfium.wasmExports.free(at);
    m.FPDFText_ClosePage(textPage);
  }
}

function originOf(doc: EditorDocument, char: string): number {
  return originsOf(doc).find((g) => g.char === char)!.x;
}

function drawnText(doc: EditorDocument): string {
  return originsOf(doc)
    .map((g) => g.char)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// Letters this narrow overlap, and PDFium reads a space into every overlap.
function drawnLetters(doc: EditorDocument): string {
  return originsOf(doc)
    .map((g) => g.char)
    .join("")
    .replace(/\s+/g, "");
}

function edit(doc: EditorDocument, nextText: string): HistoryStack {
  const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
  const history = new HistoryStack();
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
    doc,
  );
  return history;
}

test("deleting a letter from a kerned line that a clip cuts keeps the cut", async () => {
  const clipTop = BASELINE + 8;
  const doc = await open(
    pdf(
      `q 0 ${clipTop} ${PAGE_W} ${PAGE_H - clipTop} re W n BT /F1 24 Tf 72 ${BASELINE} Td ${KERNED} ET Q`,
      HELVETICA,
    ),
  );
  expect(inkedRows(doc, BASELINE - 6, clipTop)).toBe(0);

  edit(doc, "Quarterly reprt heading");

  expect(drawnText(doc)).toBe("Quarterly reprt heading");
  expect(inkedRows(doc, BASELINE - 6, clipTop)).toBe(0);
  expect(inkedRows(doc, clipTop, BASELINE + 18)).toBeGreaterThan(0);
});

test("deleting a letter from a kerned line keeps its word spacing", async () => {
  const doc = await open(
    pdf(`BT /F1 24 Tf 12 Tw 72 ${BASELINE} Td ${KERNED} ET`, HELVETICA),
  );
  const wordGap = originOf(doc, "h") - originOf(doc, "p");

  edit(doc, "Quarterly rport heading");

  expect(drawnText(doc)).toBe("Quarterly rport heading");
  expect(originOf(doc, "h") - originOf(doc, "p")).toBeCloseTo(wordGap, 2);
});

test("undo puts back a piece an in-place edit drew too narrow to keep", async () => {
  const doc = await open(
    pdf(`BT /F1 24 Tf 72 ${BASELINE} Td (${HEADING}) Tj ET`, NARROW_HELVETICA),
  );
  const run = doc.page(0).runs.find((r) => r.text === HEADING)!;
  const original = run.mergedFromPtrs[0];
  const before = originsOf(doc);

  const history = edit(doc, "Quarterly reprt heading");
  expect(run.mergedFromPtrs).not.toContain(original);

  history.undo(doc);

  expect(run.text).toBe(HEADING);
  expect(drawnLetters(doc)).toBe(HEADING.replace(/ /g, ""));
  expect(originsOf(doc)).toEqual(before);

  history.redo(doc);
  expect(drawnLetters(doc)).toBe("Quarterlyreprtheading");
});

test("undo puts back a paragraph line an in-place edit drew too narrow to keep, every time", async () => {
  const doc = await open(
    pdf(
      `BT /F1 24 Tf 72 ${BASELINE} Td (${HEADING}) Tj 0 -28 Td (Second line of the block) Tj ET`,
      NARROW_HELVETICA,
    ),
  );
  const run = doc.page(0).runs.find((r) => r.paragraphLineSlots.length > 1)!;
  const original = run.text;
  const firstLine = run.paragraphLineSlots[0].mergedFromPtrs[0];
  const before = originsOf(doc);
  const history = new HistoryStack();
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: original.replace("report", "reprt"),
    }),
    doc,
  );
  expect(run.paragraphLineSlots[0].mergedFromPtrs).not.toContain(firstLine);
  const edited = drawnLetters(doc);

  for (let i = 0; i < 3; i++) {
    history.undo(doc);
    expect(run.text).toBe(original);
    expect(originsOf(doc)).toEqual(before);
    history.redo(doc);
    expect(drawnLetters(doc)).toBe(edited);
  }
});
