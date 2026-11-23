// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { singleContentPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

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

const RENDER_MODES = singleContentPdf(
  [
    "BT /F1 26 Tf 0 Tr 1 0 0 1 72 700 Tm (Mode 0 fill) Tj ET",
    "BT /F1 26 Tf 1 Tr 1 0 0 1 72 650 Tm (Mode 1 stroke) Tj ET",
    "BT /F1 26 Tf 3 Tr 1 0 0 1 72 600 Tm (Mode 3 invisible) Tj ET",
    "BT /F1 26 Tf 7 Tr 1 0 0 1 72 550 Tm (Mode 7 clip) Tj ET",
  ].join("\n"),
);

async function opened(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

test("reads invisible text with no picture behind it as hidden text, not a scan", async () => {
  const doc = await opened(RENDER_MODES);
  try {
    const run = doc.page(0).runs.find((r) => r.text === "Mode 3 invisible")!;
    expect(run.hiddenText).toBe(true);
    expect(isScanRun(run)).toBe(false);
  } finally {
    doc.dispose();
  }
});

test("keeps invisible and clip-only lines out of the paragraph of drawn lines above them", async () => {
  const doc = await opened(RENDER_MODES);
  try {
    expect(
      doc.page(0).runs.map((r) => [r.renderMode, r.text.split("\n").length]),
    ).toEqual(
      expect.arrayContaining([
        [3, 1],
        [7, 1],
      ]),
    );
  } finally {
    doc.dispose();
  }
});

test("saves text typed into hidden text, and keeps it invisible", async () => {
  const doc = await opened(RENDER_MODES);
  let saved: EditorDocument | null = null;
  try {
    const run = doc.page(0).runs.find((r) => r.text === "Mode 3 invisible")!;
    new HistoryStack().execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: "Mode 3 invisible EXTRA",
      }),
      doc,
    );
    expect(run.text).toBe("Mode 3 invisible EXTRA");
    saved = await opened(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    const back = saved
      .page(0)
      .runs.find((r) => r.text.startsWith("Mode 3 invisible"))!;
    expect(back.text).toBe("Mode 3 invisible EXTRA");
    expect(back.renderMode).toBe(3);
  } finally {
    saved?.dispose();
    doc.dispose();
  }
});
