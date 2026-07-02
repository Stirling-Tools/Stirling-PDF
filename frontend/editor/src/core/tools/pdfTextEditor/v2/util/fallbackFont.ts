import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { RGBA } from "@app/tools/pdfTextEditor/v2/types";
import { FontRef } from "@app/tools/pdfTextEditor/v2/model/FontRef";
import { parseTrueTypeCmap } from "@app/tools/pdfTextEditor/v2/charcode/CmapResolver";
import { writeUtf16 } from "@app/services/pdfiumService";

/**
 * Client-side Unicode fallback font.
 *
 * Base-14 PDF fonts only cover Latin-1 (<= U+00FF), so editing text with
 * Cyrillic / Greek / Vietnamese / etc. used to silently DROP those glyphs
 * (`sanitizeForBase14`). We bundle Noto Sans (OFL) and embed it into the
 * document on demand via `FPDFText_LoadFont`, so the emit path can keep those
 * characters instead of losing them.
 *
 * The font is fetched once (async) and embedded per-document the first time a
 * character needs it. If the bytes aren't ready yet, callers fall back to the
 * old drop behaviour - so this is strictly additive (Latin edits are byte-for-
 * byte unchanged; only the previously-broken non-Latin path improves).
 */
const FALLBACK_FONT_URL = "/fonts/NotoSans-Regular.ttf";
const FALLBACK_FONT_ID = "__v2_unicode_fallback";
// FPDF_FONT_TRUETYPE; the trailing `true` makes it a composite (CID) font so
// FPDFText_SetText can address Unicode code points beyond 255.
const FPDF_FONT_TRUETYPE = 2;

let bytesPromise: Promise<Uint8Array | null> | null = null;
let cachedBytes: Uint8Array | null = null;
let fallbackCoverage: Map<number, number> | null = null;

/**
 * True if the fallback font has a glyph for every non-whitespace code point of
 * `text`. Fails open (returns true) when the cmap cannot be parsed so the width
 * self-check stays the only backstop, unchanged from prior behaviour.
 */
function fallbackFontCovers(text: string): boolean {
  if (!fallbackCoverage && cachedBytes) {
    fallbackCoverage = parseTrueTypeCmap(cachedBytes);
  }
  if (!fallbackCoverage) return true;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    if (!fallbackCoverage.has(cp)) return false;
  }
  return true;
}

interface ExtendedPdfiumRuntime {
  HEAPU8: Uint8Array;
}

/** Fetch the bundled fallback TTF once. Safe to call repeatedly. */
export function preloadFallbackFontBytes(): Promise<Uint8Array | null> {
  if (bytesPromise) return bytesPromise;
  bytesPromise = (async () => {
    try {
      const res = await fetch(FALLBACK_FONT_URL);
      if (!res.ok) return null;
      cachedBytes = new Uint8Array(await res.arrayBuffer());
      return cachedBytes;
    } catch {
      return null;
    }
  })();
  return bytesPromise;
}

/** Test/debug hook: bytes are loaded and a fallback emit is possible. */
export function isFallbackFontReady(): boolean {
  return !!cachedBytes && cachedBytes.length > 0;
}

/**
 * Embed the Unicode fallback font into `doc` (once) and return its FPDF font
 * handle, or 0 when the bytes aren't ready or the load failed. The owned font
 * (and its backing WASM buffer) is freed when the document disposes.
 */
export function loadFallbackFontInto(doc: EditorDocument): number {
  const existing = doc.ownedFont(FALLBACK_FONT_ID);
  if (existing) return existing.pointer;
  // Idempotent - makes sure later edits find the bytes ready even if the
  // first non-Latin edit raced the fetch.
  void preloadFallbackFontBytes();
  const bytes = cachedBytes;
  if (!bytes || bytes.length === 0) return 0;

  const m = doc.module;
  const len = bytes.length;
  const ptr = m.pdfium.wasmExports.malloc(len);
  if (!ptr) return 0;
  try {
    (m.pdfium as typeof m.pdfium & ExtendedPdfiumRuntime).HEAPU8.set(
      bytes,
      ptr,
    );
    const fontPtr = m.FPDFText_LoadFont(
      doc.docPtr,
      ptr,
      len,
      FPDF_FONT_TRUETYPE,
      true,
    );
    if (!fontPtr) {
      m.pdfium.wasmExports.free(ptr);
      return 0;
    }
    doc.registerOwnedFont(
      new FontRef({
        id: FALLBACK_FONT_ID,
        descriptor: {
          id: FALLBACK_FONT_ID,
          family: "Noto Sans",
          style: "normal",
          weight: "normal",
          bundled: true,
        },
        pointer: fontPtr,
        owned: true,
        // Free BOTH the font handle and its backing buffer on doc dispose.
        closeFn: (p) => {
          try {
            m.FPDFFont_Close(p);
          } catch {
            /* best-effort */
          }
          try {
            m.pdfium.wasmExports.free(ptr);
          } catch {
            /* best-effort */
          }
        },
      }),
    );
    return fontPtr;
  } catch {
    try {
      m.pdfium.wasmExports.free(ptr);
    } catch {
      /* best-effort */
    }
    return 0;
  }
}

/** Right edge (PDF points) of an object's visible bbox, or 0 if unmeasurable. */
function measureRightEdge(m: EditorDocument["module"], ptr: number): number {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(ptr, l, b, r, t)) return 0;
    return m.pdfium.getValue(r, "float");
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

interface CreateTextObjModule {
  FPDFPageObj_CreateTextObj?: (
    doc: number,
    font: number,
    size: number,
  ) => number;
}

/**
 * Emit ONE text object for `text` in the embedded Unicode fallback font, placed
 * at (x, y) with `fill`, inserted into the page. Returns the ptr, or 0 when the
 * font isn't available OR doesn't cover the glyphs (Noto Sans lacks CJK /
 * Arabic / Hebrew - a coverage pre-check rejects those so the caller drops
 * them via base-14 instead of persisting tofu). Used for characters base-14
 * (Latin-1) can't represent.
 */
export function emitFallbackTextObject(
  doc: EditorDocument,
  page: Page,
  text: string,
  size: number,
  fill: RGBA,
  x: number,
  y: number,
): number {
  const fb = loadFallbackFontInto(doc);
  if (!fb) return 0;
  if (!fallbackFontCovers(text)) return 0;
  const m = doc.module;
  const create = (m as unknown as CreateTextObjModule)
    .FPDFPageObj_CreateTextObj;
  if (typeof create !== "function") return 0;
  const fp = create(doc.docPtr, fb, size);
  if (!fp) return 0;
  const tp = writeUtf16(m, text);
  try {
    m.FPDFText_SetText(fp, tp);
  } finally {
    m.pdfium.wasmExports.free(tp);
  }
  m.FPDFPageObj_SetFillColor(fp, fill.r, fill.g, fill.b, fill.a);
  m.FPDFPageObj_Transform(fp, 1, 0, 0, 1, x, y);
  m.FPDFPage_InsertObject(page.pagePtr, fp);
  const right = measureRightEdge(m, fp);
  const visible = text.replace(/\s+/g, "").length;
  if (visible > 0 && right - x < visible * size * 0.05) {
    try {
      m.FPDFPage_RemoveObject(page.pagePtr, fp);
    } catch {
      /* best-effort */
    }
    try {
      m.FPDFPageObj_Destroy(fp);
    } catch {
      /* best-effort */
    }
    return 0;
  }
  return fp;
}
