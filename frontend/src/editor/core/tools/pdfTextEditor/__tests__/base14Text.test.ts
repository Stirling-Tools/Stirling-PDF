// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  emitTextLine,
  getDroppedBase14Chars,
  resetDroppedBase14Chars,
  sanitizeForBase14,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const PUNCTUATION = "don’t “quote” – — … € ™";

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
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

function blankPdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
      },
      { num: 4, body: streamBody("", "") },
    ],
    1,
  );
}

test("base-14 keeps WinAnsi punctuation", () => {
  expect(sanitizeForBase14(PUNCTUATION)).toBe(PUNCTUATION);
  expect(sanitizeForBase14("a\u0007b\u0085c")).toBe("abc");
});

test("a base-14 emit writes WinAnsi punctuation in the base-14 font", async () => {
  resetDroppedBase14Chars();
  const doc = await EditorDocument.open(blankPdf());
  try {
    const page = doc.page(0);
    emitTextLine({
      doc,
      page,
      text: PUNCTUATION,
      x: 72,
      y: 700,
      fontSize: 12,
      fill: { r: 0, g: 0, b: 0, a: 255 },
      originalFontPtr: 0,
      fallbackFamily: "Times-Roman",
      tagMarks: [],
    });
    expect(getDroppedBase14Chars()).toEqual([]);
    page.markDirty();
    page.markNeedsGenerate();
    const { blob } = await exportToBlob(doc, "punctuation.pdf");
    const back = await EditorDocument.open(
      new Uint8Array(await blob.arrayBuffer()),
    );
    try {
      const saved = back.page(0);
      PdfiumTextReader.populate(back, saved);
      expect(saved.runs.map((r) => r.text)).toEqual([PUNCTUATION]);
      expect(saved.runs[0].fontId).not.toMatch(/noto/i);
    } finally {
      back.dispose();
    }
  } finally {
    doc.dispose();
  }
});
