import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readUtf16 } from "@editor/services/pdfiumService";
import type { StructureElement } from "@editor/tools/pdfTextEditor/model/PageStructure";

type StringGetter = (el: number, buf: number, len: number) => number;

/** Bound on tree depth: a cyclic /K would otherwise recurse forever. */
const MAX_DEPTH = 64;

/**
 * Every structure element PDFium attributes to the page, in tree order. Empty
 * for an untagged document. Never throws: a tree this cannot read reads as
 * untagged, which is what the rest of the editor already handles.
 */
export function readPageStructure(
  m: WrappedPdfiumModule,
  pagePtr: number,
): StructureElement[] {
  const out: StructureElement[] = [];
  let tree = 0;
  try {
    tree = m.FPDF_StructTree_GetForPage(pagePtr);
    if (!tree) return out;
    const visit = (el: number, depth: number): void => {
      if (!el || depth > MAX_DEPTH) return;
      const mcids: number[] = [];
      const count = m.FPDF_StructElement_GetMarkedContentIdCount(el);
      for (let i = 0; i < count; i++) {
        const id = m.FPDF_StructElement_GetMarkedContentIdAtIndex(el, i);
        if (id >= 0) mcids.push(id);
      }
      out.push({
        type: readString(m, el, m.FPDF_StructElement_GetType) ?? "",
        alt: readString(m, el, m.FPDF_StructElement_GetAltText),
        actualText: readString(m, el, m.FPDF_StructElement_GetActualText),
        mcids,
        // PDFium does not expose the kids' kinds; the fallback is read-only anyway.
        onlyMarkedContent: false,
      });
      const kids = m.FPDF_StructElement_CountChildren(el);
      for (let i = 0; i < kids; i++) {
        visit(m.FPDF_StructElement_GetChildAtIndex(el, i), depth + 1);
      }
    };
    const roots = m.FPDF_StructTree_CountChildren(tree);
    for (let i = 0; i < roots; i++) {
      visit(m.FPDF_StructTree_GetChildAtIndex(tree, i), 0);
    }
  } catch {
    return [];
  } finally {
    if (tree) m.FPDF_StructTree_Close(tree);
  }
  return out;
}

/** Null when the entry is absent, which PDFium reports as length 0. */
function readString(
  m: WrappedPdfiumModule,
  el: number,
  get: StringGetter,
): string | null {
  const len = get(el, 0, 0);
  if (len <= 0) return null;
  const buf = m.pdfium.wasmExports.malloc(len);
  try {
    get(el, buf, len);
    return readUtf16(m, buf, len);
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}
