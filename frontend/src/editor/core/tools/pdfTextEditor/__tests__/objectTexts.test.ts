// @vitest-environment node
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { readUtf16 } from "@editor/services/pdfiumService";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { readObjectTexts } from "@editor/tools/pdfTextEditor/pdfium/objectTexts";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_FORM = 5;
const MAX_PAGES = 3;

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

afterAll(() => vi.unstubAllGlobals());

function textObjects(doc: EditorDocument, pagePtr: number): number[] {
  const m = doc.module;
  const out: number[] = [];
  const visit = (ptr: number, depth: number) => {
    const type = m.FPDFPageObj_GetType(ptr);
    if (type === FPDF_PAGEOBJ_TEXT) out.push(ptr);
    if (type !== FPDF_PAGEOBJ_FORM || depth > 4) return;
    for (let i = 0; i < m.FPDFFormObj_CountObjects(ptr); i++)
      visit(m.FPDFFormObj_GetObject(ptr, i), depth + 1);
  };
  for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++)
    visit(m.FPDFPage_GetObject(pagePtr, i), 0);
  return out;
}

function pdfiumText(doc: EditorDocument, textPage: number, ptr: number) {
  const m = doc.module;
  const len = m.FPDFTextObj_GetText(ptr, textPage, 0, 0);
  if (len <= 2) return "";
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    m.FPDFTextObj_GetText(ptr, textPage, buf, len);
    return readUtf16(m, buf, len);
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

const pdfs = readdirSync(FIXTURES).filter((name) => name.endsWith(".pdf"));

test.each(pdfs)(
  "reads each object's text as PDFium does, in %s",
  async (name) => {
    let doc: EditorDocument;
    try {
      doc = await EditorDocument.open(
        new Uint8Array(await readFile(path.join(FIXTURES, name))),
      );
    } catch {
      return;
    }
    try {
      for (let p = 0; p < Math.min(doc.pageCount, MAX_PAGES); p++) {
        const pagePtr = doc.page(p).pagePtr;
        const textPage = doc.module.FPDFText_LoadPage(pagePtr);
        try {
          const texts = readObjectTexts(doc.module, textPage);
          expect(texts).not.toBeNull();
          for (const ptr of textObjects(doc, pagePtr))
            expect(texts?.get(ptr) ?? "").toBe(pdfiumText(doc, textPage, ptr));
        } finally {
          doc.module.FPDFText_ClosePage(textPage);
        }
      }
    } finally {
      doc.dispose();
    }
  },
);

test("a page of ten thousand labels loads in about the time its size suggests", async () => {
  const cols = 50;
  let content = "";
  for (let i = 0; i < 10000; i++) {
    const x = 10 + (i % cols) * 11.8;
    const y = 780 - Math.floor(i / cols) * 3.8;
    content += `BT /F1 3 Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (L${i}) Tj ET\n`;
  }
  const doc = await EditorDocument.open(
    buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body:
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
            "/Resources << /Font << /F1 5 0 R >> >> >>",
        },
        { num: 4, body: streamBody("", content) },
        {
          num: 5,
          body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        },
      ],
      1,
    ),
  );
  try {
    const m = doc.module;
    const pagePtr = doc.page(0).pagePtr;
    const textPage = m.FPDFText_LoadPage(pagePtr);
    let onePass = 0;
    let perObject = 0;
    try {
      let started = performance.now();
      readObjectTexts(m, textPage);
      onePass = performance.now() - started;
      started = performance.now();
      for (const ptr of textObjects(doc, pagePtr).slice(0, 1000))
        pdfiumText(doc, textPage, ptr);
      perObject = (performance.now() - started) * 10;
    } finally {
      m.FPDFText_ClosePage(textPage);
    }
    // Relative, so a slow machine cannot fail it: the object-by-object read is far more than five times slower here.
    expect(onePass * 5).toBeLessThan(perObject);

    PdfiumTextReader.populate(doc, doc.page(0));
    expect(doc.page(0).runs.length).toBeGreaterThan(0);
  } finally {
    doc.dispose();
  }
}, 60000);

test("reads a character a font's encoding gives no code point for as U+FFFD", async () => {
  const cmap =
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n" +
    "/CMapName /UniJIS-UTF8-H def /CMapType 1 def\n" +
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> def\n" +
    "2 begincodespacerange <00> <7f> <e08080> <efbfbf> endcodespacerange\n" +
    "2 begincidrange <20> <7e> 1 <e08080> <efbfbf> 200 endcidrange\n" +
    "endcmap CMapName currentdict /CMap defineresource pop end end\n";
  const doc = await EditorDocument.open(
    buildClassicPdf(
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
          body: streamBody("", "BT /F1 12 Tf 72 700 Td <41e0e0e042> Tj ET\n"),
        },
        {
          num: 5,
          body:
            "<< /Type /Font /Subtype /Type0 /BaseFont /MSGothic-UniJIS-UTF8-H " +
            "/Encoding 7 0 R /DescendantFonts [6 0 R] >>",
        },
        {
          num: 6,
          body:
            "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /MSGothic " +
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> >>",
        },
        {
          num: 7,
          body: streamBody("/Type /CMap /CMapName /UniJIS-UTF8-H", cmap),
        },
      ],
      1,
    ),
  );
  try {
    PdfiumTextReader.populate(doc, doc.page(0));
    expect(doc.page(0).runs.map((run) => run.text)).toEqual(["A\uFFFDB"]);
  } finally {
    doc.dispose();
  }
});
