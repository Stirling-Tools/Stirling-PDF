import type { ResolverContext } from "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy";
import { tryResolveCharcodes } from "@editor/tools/pdfTextEditor/charcode/charcodeRegistry";
import { readFontName } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import { clearOnDocumentClose } from "@editor/tools/pdfTextEditor/pdfium/pointerCaches";

const FPDF_PAGEOBJ_TEXT = 1;
const FPDF_PAGEOBJ_FORM = 5;
const MAX_FORM_DEPTH = 8;

interface FormWalkModule {
  FPDFFormObj_CountObjects?: (form: number) => number;
  FPDFFormObj_GetObject?: (form: number, index: number) => number;
}

const drawn = new Map<number, Set<string>>();
const pageFonts = new Map<number, { objects: number; fonts: number[] }>();

clearOnDocumentClose(() => {
  drawn.clear();
  pageFonts.clear();
});

function faceOf(m: ResolverContext["module"], font: number): string | null {
  const name = readFontName(m, font);
  return name ? name.replace(/^[A-Z]{6}\+/, "").toLowerCase() : null;
}

function drawsChar(font: number, ch: string, ctx: ResolverContext): boolean {
  if (drawn.get(font)?.has(ch)) return true;
  let ok = false;
  try {
    const r = tryResolveCharcodes(font, ch, ctx, true)?.result;
    ok = !!r && r.coverage === 1 && r.charcodes.length === 1;
  } catch {
    ok = false;
  }
  if (ok) {
    const chars = drawn.get(font) ?? new Set<string>();
    chars.add(ch);
    drawn.set(font, chars);
  }
  return ok;
}

function collectFonts(
  m: ResolverContext["module"],
  count: number,
  objectAt: (index: number) => number,
  into: Set<number>,
  depth: number,
): void {
  const forms = m as unknown as FormWalkModule;
  for (let i = 0; i < count; i++) {
    const obj = objectAt(i);
    if (!obj) continue;
    const type = m.FPDFPageObj_GetType(obj);
    if (type === FPDF_PAGEOBJ_TEXT) {
      const font = m.FPDFTextObj_GetFont(obj);
      if (font) into.add(font);
    } else if (
      type === FPDF_PAGEOBJ_FORM &&
      depth < MAX_FORM_DEPTH &&
      forms.FPDFFormObj_CountObjects &&
      forms.FPDFFormObj_GetObject
    ) {
      const getObject = forms.FPDFFormObj_GetObject;
      collectFonts(
        m,
        forms.FPDFFormObj_CountObjects(obj),
        (index) => getObject(obj, index),
        into,
        depth + 1,
      );
    }
  }
}

function fontsOnPage(m: ResolverContext["module"], pagePtr: number): number[] {
  const objects = m.FPDFPage_CountObjects(pagePtr);
  const cached = pageFonts.get(pagePtr);
  if (cached && cached.objects === objects) return cached.fonts;
  const fonts = new Set<number>();
  collectFonts(
    m,
    objects,
    (index) => m.FPDFPage_GetObject(pagePtr, index),
    fonts,
    0,
  );
  const entry = { objects, fonts: [...fonts] };
  pageFonts.set(pagePtr, entry);
  return entry.fonts;
}

export function sameFaceFontsForChar(
  ch: string,
  likeFontPtr: number,
  ctx: ResolverContext,
): number[] {
  if (!likeFontPtr || !ch) return [];
  const fonts = drawsChar(likeFontPtr, ch, ctx) ? [likeFontPtr] : [];
  const face = faceOf(ctx.module, likeFontPtr);
  if (face === null) return fonts;
  for (const font of fontsOnPage(ctx.module, ctx.pagePtr))
    if (
      font !== likeFontPtr &&
      faceOf(ctx.module, font) === face &&
      drawsChar(font, ch, ctx)
    )
      fonts.push(font);
  return fonts;
}

export function sameFaceFontForChar(
  ch: string,
  likeFontPtr: number,
  ctx: ResolverContext,
): number | null {
  if (!likeFontPtr || !ch) return null;
  if (drawsChar(likeFontPtr, ch, ctx)) return likeFontPtr;
  const face = faceOf(ctx.module, likeFontPtr);
  if (face === null) return null;
  for (const font of fontsOnPage(ctx.module, ctx.pagePtr)) {
    if (font === likeFontPtr || faceOf(ctx.module, font) !== face) continue;
    if (drawsChar(font, ch, ctx)) return font;
  }
  return null;
}

export function sameFaceFontsFor(
  text: string,
  likeFontPtr: number,
  ctx: ResolverContext,
): number[] | null {
  const fonts: number[] = [];
  for (const ch of text) {
    const font = sameFaceFontForChar(ch, likeFontPtr, ctx);
    if (font === null) return null;
    fonts.push(font);
  }
  return fonts;
}
