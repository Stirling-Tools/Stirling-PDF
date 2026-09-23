import type {
  CharcodeResolver,
  CharcodeResolveResult,
  ResolverContext,
} from "@app/tools/pdfTextEditor/charcode/CharcodeStrategy";

// Strategy 2: scrape Unicode→charcode mappings by walking the page's existing
// text via PDFium's text page API.

interface TextPageModule {
  FPDFText_LoadPage?: (page: number) => number;
  FPDFText_ClosePage?: (textPage: number) => void;
  FPDFText_CountChars?: (textPage: number) => number;
  FPDFText_GetUnicode?: (textPage: number, idx: number) => number;
  FPDFText_GetTextObject?: (textPage: number, idx: number) => number;
}

interface FontReadModule {
  FPDFTextObj_GetFont?: (obj: number) => number;
}

/** Cache: per-page-pointer Map<font, Map<unicode, charcode>>. */
const perPageCache = new Map<number, Map<number, Map<number, number>>>();

export class ContentStreamResolver implements CharcodeResolver {
  readonly name = "content-stream" as const;

  resolve(
    font: number,
    text: string,
    ctx: ResolverContext,
  ): CharcodeResolveResult | null {
    if (!font) return null;
    const unicodeToCharcode = getOrBuildMap(font, ctx);
    if (!unicodeToCharcode) {
      return {
        charcodes: [],
        coverage: 0,
        missing: [...text],
        note: "content-stream scan returned no entries for this font",
      };
    }
    const charcodes: number[] = [];
    const missing: string[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const cc = unicodeToCharcode.get(cp);
      if (cc === undefined) {
        missing.push(ch);
        continue;
      }
      charcodes.push(cc);
    }
    return {
      charcodes,
      coverage: charcodes.length,
      missing,
      note: `content-stream entries: ${unicodeToCharcode.size}, requested: ${text.length}, resolved: ${charcodes.length}`,
    };
  }
}

function getOrBuildMap(
  font: number,
  ctx: ResolverContext,
): Map<number, number> | null {
  let pageMap = perPageCache.get(ctx.pagePtr);
  if (!pageMap) {
    pageMap = buildPageMap(ctx);
    perPageCache.set(ctx.pagePtr, pageMap);
  }
  return pageMap.get(font) ?? null;
}

function buildPageMap(ctx: ResolverContext): Map<number, Map<number, number>> {
  const m = ctx.module;
  const tpMod = m as unknown as TextPageModule;
  const fontMod = m as unknown as FontReadModule;
  const out = new Map<number, Map<number, number>>();
  if (
    !tpMod.FPDFText_LoadPage ||
    !tpMod.FPDFText_CountChars ||
    !tpMod.FPDFText_GetUnicode ||
    !tpMod.FPDFText_GetTextObject ||
    !fontMod.FPDFTextObj_GetFont
  ) {
    return out;
  }
  const textPage = tpMod.FPDFText_LoadPage(ctx.pagePtr);
  if (!textPage) return out;
  try {
    const count = tpMod.FPDFText_CountChars(textPage);
    // Per-FONT counter (not per-text-object): every unique Unicode we encounter
    // in a given font gets the next sequential CID starting at 1.
    const perFontNext = new Map<number, number>();
    for (let i = 0; i < count; i++) {
      const unicode = tpMod.FPDFText_GetUnicode(textPage, i);
      if (!unicode) continue;
      const obj = tpMod.FPDFText_GetTextObject(textPage, i);
      if (!obj) continue;
      let font = 0;
      try {
        font = fontMod.FPDFTextObj_GetFont(obj);
      } catch {
        /* skip */
      }
      if (!font) continue;
      let fontMap = out.get(font);
      if (!fontMap) {
        fontMap = new Map<number, number>();
        out.set(font, fontMap);
      }
      if (!fontMap.has(unicode)) {
        const nextCid = (perFontNext.get(font) ?? 0) + 1;
        perFontNext.set(font, nextCid);
        fontMap.set(unicode, nextCid);
      }
    }
  } finally {
    if (tpMod.FPDFText_ClosePage) {
      try {
        tpMod.FPDFText_ClosePage(textPage);
      } catch {
        /* best-effort */
      }
    }
  }
  return out;
}

/** Clear the per-page Unicode→charcode cache. */
export function resetContentStreamCache(): void {
  perPageCache.clear();
}

/** Test-only alias for {@link resetContentStreamCache}. */
export function _clearContentStreamCacheForTests(): void {
  resetContentStreamCache();
}
