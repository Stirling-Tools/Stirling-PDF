import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { clearOnDocumentClose } from "@editor/tools/pdfTextEditor/pdfium/pointerCaches";

const FPDF_PAGEOBJ_TEXT = 1;

const names = new Map<number, string>();
clearOnDocumentClose(() => names.clear());

export function nameUnnamedFonts(
  m: WrappedPdfiumModule,
  pagePtr: number,
  order: ReadonlyArray<string | null>,
): void {
  const found = new Map<number, string | null>();
  const count = m.FPDFPage_CountObjects(pagePtr);
  let at = 0;
  for (let i = 0; i < count; i++) {
    const obj = m.FPDFPage_GetObject(pagePtr, i);
    if (!obj || m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
    if (at >= order.length) return;
    const name = order[at++];
    const font = m.FPDFTextObj_GetFont(obj);
    if (!font) continue;
    const known = found.get(font);
    if (known !== undefined && known !== name) return;
    found.set(font, name);
  }
  if (at !== order.length) return;
  for (const [font, name] of found) if (name) names.set(font, name);
}

export function unnamedFontName(fontPtr: number): string | undefined {
  return names.get(fontPtr);
}
