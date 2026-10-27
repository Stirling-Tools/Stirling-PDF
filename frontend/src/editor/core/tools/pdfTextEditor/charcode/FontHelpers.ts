import type { ResolverContext } from "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

/**
 * Client-side font helpers for the charcode emit path.
 *
 * Font handles are PDFium pointers, only valid for the document that produced
 * them, so every cache here is pointer-keyed and dropped between documents
 * (`resetFontHelperCaches`).
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

// Find an existing char on the current page whose text object uses the given
// font.
const fontForCharCache = new Map<string, number | null>();

/** Bold/italic classification of a font, read from its /BaseFont name. */
export interface FontStyleClass {
  bold: boolean;
  italic: boolean;
}

/**
 * Classify a font handle as bold/italic from its /BaseFont name.
 *
 * Borrowing a glyph from a face of a different weight is what made edited body
 * text come back bold: the first "o" in document order often lives in a bold
 * heading.
 */
export function fontStyleClass(
  m: ResolverContext["module"],
  fontPtr: number,
): FontStyleClass | null {
  const name = readFontName(m, fontPtr);
  if (!name) return null;
  return styleClassFromName(name);
}

/** Same classification from a font FAMILY name (base-14 or device font). */
export function styleClassFromName(name: string): FontStyleClass {
  return {
    bold: /bold|black|heavy|semibold|demi/i.test(name),
    italic: /italic|oblique/i.test(name),
  };
}

const reusableFontCache = new Map<number, boolean>();

/**
 * Whether a font has a real font program behind it.
 *
 * A Type 3 face is a dictionary of content-stream procedures, so PDFium can
 * report neither a glyph advance nor a usable ink box for it. Its glyphs are
 * still drawable - callers may reuse one when they can measure its advance
 * some other way - but laying out new text on PDFium's numbers alone stacks
 * every glyph on the previous one.
 */
export function fontIsReusable(
  m: ResolverContext["module"],
  fontPtr: number,
): boolean {
  if (!fontPtr) return false;
  const cached = reusableFontCache.get(fontPtr);
  if (cached !== undefined) return cached;
  const getData = (
    m as unknown as {
      FPDFFont_GetFontData?: (
        font: number,
        buf: number,
        buflen: number,
        outLen: number,
      ) => boolean;
    }
  ).FPDFFont_GetFontData;
  // No API to ask with: assume reusable so nothing regresses.
  if (typeof getData !== "function") {
    reusableFontCache.set(fontPtr, true);
    return true;
  }
  // A Type 3 font is a dictionary of content-stream procedures, not a font
  // program. PDFium still answers "true" for it, but reports a length of 0 -
  // the length is the part that distinguishes a real face.
  let ok = false;
  const out = scratchPtr(m, SCRATCH.backendOut, 4);
  try {
    m.pdfium.setValue(out, 0, "i32");
    ok = getData(fontPtr, 0, 0, out) && m.pdfium.getValue(out, "i32") > 0;
  } catch {
    ok = false;
  }
  reusableFontCache.set(fontPtr, ok);
  return ok;
}

/** Test-only: clear the reusable-font cache. */
export function _clearReusableFontCacheForTests(): void {
  reusableFontCache.clear();
}

export function findFontForChar(
  unicodeChar: string,
  ctx: ResolverContext,
  // When given, only fonts with the SAME bold/italic class as this one are
  // accepted, so a borrowed glyph never changes the run's weight or slant.
  likeFontPtr?: number,
  // Used when there is no source font handle to read a style from - notably on
  // the undo path, which re-emits with `originalFontPtr: 0`. Without it the
  // borrow is unconstrained again and restored body text comes back bold.
  likeStyle?: FontStyleClass | null,
): number | null {
  if (!unicodeChar) return null;
  const cp = unicodeChar.codePointAt(0);
  if (cp === undefined) return null;
  const m = ctx.module;
  const want =
    (likeFontPtr ? fontStyleClass(m, likeFontPtr) : null) ?? likeStyle ?? null;
  // The style is part of the answer, so it must be part of the cache key.
  const styleK = want
    ? `${want.bold ? "b" : ""}${want.italic ? "i" : ""}|`
    : "";
  // So is the source face: the borrow prefers the run's own family, so two
  // runs of different families must not share an answer.
  const likeName = likeFontPtr
    ? baseFontFamily(readFontName(m, likeFontPtr))
    : undefined;
  const cacheK = `${ctx.pagePtr}:${styleK}${likeName ?? ""}|${cp}`;
  if (fontForCharCache.has(cacheK)) return fontForCharCache.get(cacheK) ?? null;
  const tpMod = m as unknown as TextPageModule;
  const fontMod = m as unknown as FontReadModule;
  if (
    !tpMod.FPDFText_LoadPage ||
    !tpMod.FPDFText_CountChars ||
    !tpMod.FPDFText_GetUnicode ||
    !tpMod.FPDFText_GetTextObject ||
    !fontMod.FPDFTextObj_GetFont
  ) {
    fontForCharCache.set(cacheK, null);
    return null;
  }
  const textPage = tpMod.FPDFText_LoadPage(ctx.pagePtr);
  if (!textPage) {
    fontForCharCache.set(cacheK, null);
    return null;
  }
  try {
    const count = tpMod.FPDFText_CountChars(textPage);
    // The run's OWN family, wherever the page happens to draw this char in it,
    // beats whichever style-compatible face comes first in content order. A
    // word the document already uses otherwise came back in a near-miss face -
    // right weight, slightly wrong shapes and advances.
    let fallback: number | null = null;
    for (let i = 0; i < count; i++) {
      const u = tpMod.FPDFText_GetUnicode(textPage, i);
      if (u !== cp) continue;
      const obj = tpMod.FPDFText_GetTextObject(textPage, i);
      if (!obj) continue;
      try {
        const f = fontMod.FPDFTextObj_GetFont(obj);
        if (!f) continue;
        if (want) {
          const got = fontStyleClass(m, f);
          // An unnamed font can't be vouched for; skip it rather than risk a
          // weight change.
          if (!got || got.bold !== want.bold || got.italic !== want.italic) {
            continue;
          }
        }
        if (!likeName || baseFontFamily(readFontName(m, f)) === likeName) {
          fontForCharCache.set(cacheK, f);
          return f;
        }
        if (fallback === null) fallback = f;
      } catch {
        continue;
      }
    }
    if (fallback !== null) {
      fontForCharCache.set(cacheK, fallback);
      return fallback;
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
  fontForCharCache.set(cacheK, null);
  return null;
}

/** Test-only: clear the per-char-font cache. */
export function _clearFontForCharCacheForTests(): void {
  fontForCharCache.clear();
}

interface FontNameModule {
  FPDFFont_GetBaseFontName?: (font: number, buf: number, len: number) => number;
}

/**
 * A face's family, with the subset tag and style suffix stripped:
 * "ABCDEF+LMRoman12-Regular" -> "lmroman12". Two handles that agree here are
 * the same design, so a glyph borrowed across them keeps the run's look.
 */
function baseFontFamily(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const family = name.replace(/^[A-Z]{6}\+/, "").split(/[-,]/)[0];
  return family ? family.toLowerCase() : undefined;
}

const fontNameCache = new Map<number, string | undefined>();

/** Test-only: clear the memoised /BaseFont names. */
export function _clearFontNameCacheForTests(): void {
  fontNameCache.clear();
}

// Read a font's /BaseFont name, the identity used to tell WHICH face a handle
// points at when two fonts on the page render the same char.
function readFontName(
  m: ResolverContext["module"],
  fontPtr: number,
): string | undefined {
  if (!fontPtr) return undefined;
  if (fontNameCache.has(fontPtr)) return fontNameCache.get(fontPtr);
  const name = loadFontName(m, fontPtr);
  fontNameCache.set(fontPtr, name);
  return name;
}

function loadFontName(
  m: ResolverContext["module"],
  fontPtr: number,
): string | undefined {
  const fn = (m as unknown as FontNameModule).FPDFFont_GetBaseFontName;
  if (typeof fn !== "function") return undefined;
  try {
    const len = fn(fontPtr, 0, 0);
    if (len <= 1) return undefined;
    const buf = scratchPtr(m, SCRATCH.readerReadTextB, len);
    fn(fontPtr, buf, len);
    return m.pdfium.UTF8ToString(buf) || undefined;
  } catch {
    return undefined;
  }
}

/** Drop every pointer-keyed font cache. PDFium reuses handles across documents. */
export function resetFontHelperCaches(): void {
  fontForCharCache.clear();
  reusableFontCache.clear();
  fontNameCache.clear();
}
