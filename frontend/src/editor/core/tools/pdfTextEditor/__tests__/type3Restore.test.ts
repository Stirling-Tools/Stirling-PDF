// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

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

const BOX = "0 0 500 700 d1 0 0 500 700 re f";

// A Type 3 font as older Matplotlib writes it: glyphs named by a Differences
// encoding and no ToUnicode map.
function type3Pdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
          "/Resources << /Font << /T3 5 0 R >> >> /Contents 4 0 R >>",
      },
      {
        num: 4,
        body: streamBody("", "BT /T3 20 Tf 72 700 Td (abba) Tj ET"),
      },
      {
        num: 5,
        body:
          "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 500 700] " +
          "/FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /a 6 0 R /b 7 0 R >> " +
          "/Encoding << /Type /Encoding /Differences [97 /a /b] >> " +
          "/FirstChar 97 /LastChar 98 /Widths [500 500] /Resources << >> >>",
      },
      { num: 6, body: streamBody("", BOX) },
      { num: 7, body: streamBody("", BOX) },
    ],
    1,
  );
}

test("refuses, with a reason, to put text back in a Type 3 document font it cannot write", async () => {
  const doc = await EditorDocument.open(type3Pdf());
  try {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    const run = page.runs.find((r) => r.text.trim() === "abba")!;
    const original = run.fontId;
    new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: "Helvetica",
    }).apply(doc);
    expect(run.fontId).not.toBe(original);

    const restore = new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: original,
    });
    expect(restore.refusal(doc)).toBe("notRestored");
  } finally {
    doc.dispose();
  }
});
