import fs from "node:fs";
import path from "node:path";
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";

async function loadPdfium(): Promise<WrappedPdfiumModule> {
  const wasm = fs.readFileSync(
    path.join(process.cwd(), "node_modules/@embedpdf/pdfium/dist/pdfium.wasm"),
  );
  const m = await init({ wasmBinary: wasm });
  m.PDFiumExt_Init?.();
  return m;
}

/** Extracts each page's text through PDFium for Playwright Node-side assertions. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const m = await loadPdfium();
  const dataPtr = m.pdfium.wasmExports.malloc(bytes.length);
  if (!dataPtr) throw new Error("PDFium: failed to allocate input bytes");
  const heap = (m.pdfium as typeof m.pdfium & { HEAPU8: Uint8Array }).HEAPU8;
  heap.set(bytes, dataPtr);

  const docPtr = m.FPDF_LoadMemDocument(dataPtr, bytes.length, "");
  if (!docPtr) {
    m.pdfium.wasmExports.free(dataPtr);
    throw new Error("PDFium: failed to open PDF");
  }

  const parts: string[] = [];
  try {
    const pageCount = m.FPDF_GetPageCount(docPtr);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
      if (!pagePtr) continue;
      const textPagePtr = m.FPDFText_LoadPage(pagePtr);
      try {
        if (!textPagePtr) continue;
        const charCount = m.FPDFText_CountChars(textPagePtr);
        let pageText = "";
        for (let i = 0; i < charCount; i += 1) {
          pageText += String.fromCodePoint(
            m.FPDFText_GetUnicode(textPagePtr, i),
          );
        }
        parts.push(pageText);
      } finally {
        if (textPagePtr) m.FPDFText_ClosePage(textPagePtr);
        m.FPDF_ClosePage(pagePtr);
      }
    }
  } finally {
    m.FPDF_CloseDocument(docPtr);
    m.pdfium.wasmExports.free(dataPtr);
  }

  return parts.join("\n");
}
