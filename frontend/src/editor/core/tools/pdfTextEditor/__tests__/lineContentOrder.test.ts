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

const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_PATH = 2;

// A highlight drawn between two words of a line, as word processors export one.
function highlightedLinePdf(): Uint8Array {
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
        body: streamBody(
          "",
          "BT /F1 12 Tf 72 700 Td (Alpha ) Tj ET\n" +
            "1 1 0 rg 106 696 30 14 re f 0 g\n" +
            "BT /F1 12 Tf 108 700 Td (Beta ) Tj ET\n" +
            "BT /F1 12 Tf 138 700 Td (Gamma) Tj ET\n",
        ),
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

// The page's objects in content order: "#" for a path, else the text it draws.
function contentOrder(doc: EditorDocument): string[] {
  const m = doc.module;
  const page = doc.page(0);
  const buf = m.pdfium.wasmExports.malloc(512);
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  const out: string[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(page.pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(page.pagePtr, i);
      const type = m.FPDFPageObj_GetType(obj);
      if (type === FPDF_PAGEOBJ_PATH) out.push("#");
      else if (type === FPDF_PAGEOBJ_TEXT) {
        m.FPDFTextObj_GetText(obj, textPage, buf, 512);
        const text = m.pdfium.UTF16ToString(buf).trim();
        if (text) out.push(text);
      }
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(buf);
  }
  return out;
}

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(highlightedLinePdf());
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

describe("editing a line with a highlight drawn between its words", () => {
  test("keeps the highlight under its word when another word is typed", async () => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text.includes("Beta"))!;
    expect(run.text).toBe("Alpha Beta Gamma");
    expect(contentOrder(doc)).toEqual(["Alpha", "#", "Beta", "Gamma"]);

    const cmd = new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: "Alpha New Beta Gamma Delta",
    });
    cmd.apply(doc);

    const order = contentOrder(doc);
    expect(order.indexOf("#")).toBeLessThan(order.indexOf("Beta"));
    expect(order.filter((piece) => piece !== "#").join(" ")).toBe(
      "Alpha New Beta Gamma Delta",
    );

    cmd.revert(doc);
    expect(contentOrder(doc)).toEqual(["Alpha", "#", "Beta", "Gamma"]);
  });
});
