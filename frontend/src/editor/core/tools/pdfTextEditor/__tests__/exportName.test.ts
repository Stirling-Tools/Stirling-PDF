// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const opened: EditorDocument[] = [];

async function exportedName(sourceName?: string | null) {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 300]);
  const doc = await EditorDocument.open(await pdf.save(), "");
  opened.push(doc);
  return (await exportToBlob(doc, sourceName)).filename;
}

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

afterAll(() => vi.unstubAllGlobals());

it("saves under the opened file's own name", async () => {
  expect(await exportedName("report.pdf")).toBe("report.pdf");
});

it.each([undefined, null, "  "])(
  "falls back to a generic name when the source name is %j",
  async (sourceName) => {
    expect(await exportedName(sourceName)).toBe("edited.pdf");
  },
);
