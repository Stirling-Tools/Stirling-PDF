import type {
  CharcodeResolver,
  CharcodeResolveResult,
  ResolverContext,
} from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

/**
 * Strategy 2: scrape Unicode→charcode mappings by walking the page's
 * existing text via PDFium's text page API, then matching against
 * `FPDFText_GetTextObject` to pin each char to a font.
 *
 * The key insight: `FPDFText_CountChars(textPage)` returns every
 * char on the page in reading order. For each char index we can ask:
 *   - `FPDFText_GetUnicode(textPage, idx)` → the Unicode codepoint
 *   - `FPDFText_GetTextObject(textPage, idx)` → the text object
 *     backing that char
 *   - `FPDFTextObj_GetFont(obj)` → the font handle
 *
 * Internally, PDFium iterates chars in the SAME order they appear
 * in the content stream's Tj/TJ operators, so the Nth Unicode at a
 * given text object IS the Nth charcode that text object was
 * written with. We don't get the raw charcode out of the public
 * API - but we DON'T NEED IT for CIDFontType2 / TrueType subset
 * fonts, because for those PDFium uses the glyph index as the
 * charcode, and the glyph index = position in the text object's
 * char sequence ONLY for the simplest fonts.
 *
 * In practice this strategy works as follows: for each (font, char)
 * pair seen on the page, we record "the char at position N inside
 * text-object T has Unicode U". When the user asks for a charcode
 * for Unicode U in font F, we look up any matching (T, N) and
 * return N as a guess. This is brittle (assumes 1:1
 * charcode-to-glyph-index for subset fonts) but works on a lot of
 * Word/Acrobat-emitted subset fonts where the embedding is
 * straightforward.
 *
 * When this strategy disagrees with the cmap strategy on a
 * specific font, that's a useful signal that the font's encoding
 * is non-trivial and only the backend (PDFBox) will get it right.
 */

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
    // Per-FONT counter (not per-text-object): every unique Unicode
    // we encounter in a given font gets the next sequential CID
    // starting at 1. This matches what most font subsetters do
    // (CID 0 = .notdef, CID 1 = first glyph used in the document,
    // CID 2 = second, etc.). For Word/InDesign/Acrobat-emitted CID
    // subsets this often produces the correct mapping; for
    // hand-rolled or re-encoded subsets it'll guess wrong.
    //
    // We dedupe so each Unicode gets ONE CID (its first appearance
    // index). A later appearance of the same Unicode is the SAME
    // glyph so the same CID is correct.
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

/** Test-only: clear the per-page cache. */
export function _clearContentStreamCacheForTests(): void {
  perPageCache.clear();
}
