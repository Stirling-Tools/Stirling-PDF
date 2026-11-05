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
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumSave } from "@editor/tools/pdfTextEditor/pdfium/PdfiumSave";
import {
  applyTagMarks,
  copyTagMarks,
  readTagMarks,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { emitTextLine } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { allowConsole } from "@editor/tests/failOnConsole";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// Runs against the real PDFium build: whether the generator writes a mark back
// out is the behaviour under test, and a mock would only restate the intent.

const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_PATH = 2;
const FPDF_PAGEOBJ_IMAGE = 3;

// A paragraph (MCID 0) whose second line sits in an /ActualText span, a figure
// (MCID 1) and an artifact rule.
const CONTENT =
  "/P <</MCID 0>> BDC BT /F1 24 Tf 72 700 Td (Hello) Tj ET " +
  "/Span <</ActualText (fi)>> BDC BT /F1 24 Tf 72 670 Td (fi) Tj ET EMC EMC\n" +
  "/Figure <</MCID 1>> BDC q 100 0 0 100 72 500 cm /Im1 Do Q EMC\n" +
  "/Artifact BMC 0 0 1 rg 10 10 50 5 re f EMC\n";

function taggedPdf(): Uint8Array {
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /StructParents 0 " +
          "/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 10 0 R >> >> >>",
      },
      { num: 4, body: streamBody("", CONTENT) },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 11 0 R /ParentTreeNextKey 1 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R 9 0 R] >>",
      },
      {
        num: 8,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>",
      },
      {
        num: 9,
        body: "<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 1 /Alt (A grey square) >>",
      },
      {
        num: 10,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\x80",
        ),
      },
      { num: 11, body: "<< /Nums [0 [8 0 R 9 0 R]] >>" },
    ],
    1,
  );
}

const opened: EditorDocument[] = [];

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  return doc;
}

function objects(m: WrappedPdfiumModule, pagePtr: number): number[] {
  const out: number[] = [];
  const n = m.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < n; i++) out.push(m.FPDFPage_GetObject(pagePtr, i));
  return out;
}

function ofType(m: WrappedPdfiumModule, pagePtr: number, type: number) {
  return objects(m, pagePtr).filter((p) => m.FPDFPageObj_GetType(p) === type);
}

/** MCIDs the page's structure tree refers to. */
function treeMcids(m: WrappedPdfiumModule, pagePtr: number): number[] {
  const tree = m.FPDF_StructTree_GetForPage(pagePtr);
  const out: number[] = [];
  const walk = (el: number) => {
    const n = m.FPDF_StructElement_GetMarkedContentIdCount(el);
    for (let i = 0; i < n; i++) {
      const id = m.FPDF_StructElement_GetMarkedContentIdAtIndex(el, i);
      if (id >= 0) out.push(id);
    }
    const kids = m.FPDF_StructElement_CountChildren(el);
    for (let i = 0; i < kids; i++) {
      const kid = m.FPDF_StructElement_GetChildAtIndex(el, i);
      if (kid) walk(kid);
    }
  };
  for (let i = 0; i < m.FPDF_StructTree_CountChildren(tree); i++) {
    walk(m.FPDF_StructTree_GetChildAtIndex(tree, i));
  }
  m.FPDF_StructTree_Close(tree);
  return out.sort();
}

/** MCIDs the page's content carries. */
function contentMcids(m: WrappedPdfiumModule, pagePtr: number): number[] {
  const ids = objects(m, pagePtr)
    .map((p) => m.FPDFPageObj_GetMarkedContentID(p))
    .filter((id) => id >= 0);
  return [...new Set(ids)].sort();
}

function newText(doc: EditorDocument, text: string, y: number): number {
  const m = doc.module;
  const ptr = m.FPDFPageObj_NewTextObj(doc.docPtr, "Helvetica", 24);
  const wide = m.pdfium.wasmExports.malloc((text.length + 1) * 2);
  m.pdfium.stringToUTF16(text, wide, (text.length + 1) * 2);
  m.FPDFText_SetText(ptr, wide);
  m.pdfium.wasmExports.free(wide);
  m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, 72, y);
  return ptr;
}

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
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

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// jsdom has no 2D canvas, so text measurement falls back and says so.
const NO_CANVAS = /HTMLCanvasElement's getContext\(\) method/;

describe("PdfiumTagMarks", () => {
  test("reads only the tags that place content in the structure tree", async () => {
    const doc = await open(taggedPdf());
    const m = doc.module;
    const page = doc.page(0);

    const [hello, ligature] = ofType(m, page.pagePtr, FPDF_PAGEOBJ_TEXT);
    expect(readTagMarks(m, hello)).toEqual([{ name: "P", mcid: 0 }]);
    // The /ActualText span describes the original glyphs, so it is dropped.
    expect(readTagMarks(m, ligature)).toEqual([{ name: "P", mcid: 0 }]);

    const [image] = ofType(m, page.pagePtr, FPDF_PAGEOBJ_IMAGE);
    expect(readTagMarks(m, image)).toEqual([{ name: "Figure", mcid: 1 }]);

    const [rule] = ofType(m, page.pagePtr, FPDF_PAGEOBJ_PATH);
    expect(readTagMarks(m, rule)).toEqual([{ name: "Artifact", mcid: null }]);
  });

  test("a replacement object keeps the tag through a save", async () => {
    const doc = await open(taggedPdf());
    const m = doc.module;
    const page = doc.page(0);
    const texts = ofType(m, page.pagePtr, FPDF_PAGEOBJ_TEXT);

    for (const [i, old] of texts.entries()) {
      const replacement = newText(doc, `Edited ${i}`, 700 - i * 30);
      copyTagMarks(m, doc.docPtr, old, replacement);
      m.FPDFPage_RemoveObject(page.pagePtr, old);
      m.FPDFPageObj_Destroy(old);
      m.FPDFPage_InsertObject(page.pagePtr, replacement);
    }
    page.markDirty();

    const saved = await open(PdfiumSave.serialize(doc));
    const savedPage = saved.page(0);
    for (const ptr of ofType(m, savedPage.pagePtr, FPDF_PAGEOBJ_TEXT)) {
      expect(m.FPDFPageObj_GetMarkedContentID(ptr)).toBe(0);
    }
    expect(contentMcids(m, savedPage.pagePtr)).toEqual(
      treeMcids(m, savedPage.pagePtr),
    );
  });

  test("an object that already carries a mark is not tagged again", async () => {
    const doc = await open(taggedPdf());
    const m = doc.module;
    const ptr = newText(doc, "Fresh", 400);
    const tags = [{ name: "P", mcid: 0 }];

    applyTagMarks(m, doc.docPtr, [ptr], tags);
    applyTagMarks(m, doc.docPtr, [ptr], tags);

    expect(m.FPDFPageObj_CountMarks(ptr)).toBe(1);
    m.FPDFPageObj_Destroy(ptr);
  });

  test("emitTextLine tags each object it creates exactly once", async () => {
    allowConsole.error(NO_CANVAS);
    const doc = await open(taggedPdf());
    const m = doc.module;
    const page = doc.page(0);

    const ptrs = emitTextLine({
      doc,
      page,
      text: "several words on one line",
      x: 72,
      y: 400,
      fontSize: 12,
      fill: { r: 0, g: 0, b: 0, a: 255 },
      originalFontPtr: 0,
      fallbackFamily: "Helvetica",
      tagMarks: [{ name: "P", mcid: 0 }],
    });

    expect(ptrs.length).toBeGreaterThan(1);
    for (const ptr of ptrs) {
      expect(m.FPDFPageObj_CountMarks(ptr)).toBe(1);
      expect(readTagMarks(m, ptr)).toEqual([{ name: "P", mcid: 0 }]);
    }
  });

  test("new content emitted with no tags stays untagged", async () => {
    allowConsole.error(NO_CANVAS);
    const doc = await open(taggedPdf());
    const m = doc.module;
    const page = doc.page(0);

    const ptrs = emitTextLine({
      doc,
      page,
      text: "Inserted",
      x: 72,
      y: 300,
      fontSize: 12,
      fill: { r: 0, g: 0, b: 0, a: 255 },
      originalFontPtr: 0,
      fallbackFamily: "Helvetica",
      tagMarks: [],
    });

    for (const ptr of ptrs) expect(m.FPDFPageObj_CountMarks(ptr)).toBe(0);
  });
});
