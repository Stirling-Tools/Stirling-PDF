// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// The form draws at a quarter of its own scale, as design tools export labels.
const FORM_SCALE = 0.25;
const FORM_X = 72;

function scaledFormPdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /XObject << /Fm1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody(
          "",
          `q ${FORM_SCALE} 0 0 ${FORM_SCALE} ${FORM_X} 700 cm /Fm1 Do Q\n`,
        ),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 2000 400] " +
            "/Resources << /Font << /F1 6 0 R >> >>",
          "BT /F1 48 Tf 0 100 Td (Open Source) Tj ET\n",
        ),
      },
      {
        num: 6,
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

function leftEdge(doc: EditorDocument, ptr: number): number {
  const m = doc.module;
  const box = m.pdfium.wasmExports.malloc(16);
  try {
    m.FPDFPageObj_GetBounds(ptr, box, box + 4, box + 8, box + 12);
    return m.pdfium.getValue(box, "float");
  } finally {
    m.pdfium.wasmExports.free(box);
  }
}

describe("typing before text drawn inside a scaled form", () => {
  test("moves it along the page by the width of what was typed", async () => {
    const doc = await EditorDocument.open(scaledFormPdf());
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    const run = doc.page(0).runs.find((r) => r.text.includes("Open"))!;
    const label = run.mergedFromPtrs[0];
    const before = FORM_X + leftEdge(doc, label) * FORM_SCALE;

    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: "Xk " + run.text,
    }).apply(doc);

    const typed = run.mergedFromPtrs.find((ptr) => ptr !== label)!;
    const typedRight = (() => {
      const m = doc.module;
      const box = m.pdfium.wasmExports.malloc(16);
      m.FPDFPageObj_GetBounds(typed, box, box + 4, box + 8, box + 12);
      const right = m.pdfium.getValue(box + 8, "float");
      m.pdfium.wasmExports.free(box);
      return right;
    })();
    const after = FORM_X + leftEdge(doc, label) * FORM_SCALE;
    expect(after).toBeGreaterThan(typedRight);
    expect(after - before).toBeGreaterThan(typedRight - before);
  });
});
