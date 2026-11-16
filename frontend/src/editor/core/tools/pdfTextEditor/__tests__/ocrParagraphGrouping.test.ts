// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

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

afterAll(() => vi.unstubAllGlobals());

test("reads a scanned paragraph whose lines OCR sized a point or two apart as one paragraph", async () => {
  const doc = await EditorDocument.open(
    new Uint8Array(
      await readFile(
        path.join(
          import.meta.dirname,
          "../../../tests/test-fixtures/scanned-ocr-paragraph.pdf",
        ),
      ),
    ),
  );
  try {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    expect(page.runs.map((run) => run.text.split("\n").length)).toEqual([4, 1]);
    expect(page.runs[0].text).toMatch(/^This agreement.*\nwill deliver/);
    expect(page.runs[0].text).toMatch(/\ninterest at two percent per month\.$/);
    expect(page.runs[1].text).toBe("Signed: Maria Silva");
  } finally {
    doc.dispose();
  }
});
