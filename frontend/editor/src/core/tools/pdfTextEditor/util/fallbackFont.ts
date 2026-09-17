import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { RGBA } from "@app/tools/pdfTextEditor/types";
import { FontRef } from "@app/tools/pdfTextEditor/model/FontRef";
import { parseTrueTypeCmap } from "@app/tools/pdfTextEditor/charcode/CmapResolver";
import { writeUtf16 } from "@app/services/pdfiumService";
import { BASE_PATH } from "@app/constants/app";
import {
  getLocalFontBytes,
  loadedLocalFonts,
  loadLocalFontBytes,
  pickLocalFontFace,
} from "@app/tools/pdfTextEditor/util/localFonts";

/** Client-side Unicode fallback font. */
// BASE_PATH-prefixed: a bare "/fonts/..." 404s on subpath deployments
// (context-path / RUN_SUBPATH installs), permanently disabling the fallback.
const FALLBACK_FONT_URL = `${BASE_PATH}/fonts/NotoSans-Regular.ttf`;
const HEBREW_FALLBACK_FONT_URL = `${BASE_PATH}/fonts/NotoSansHebrew-Regular.ttf`;
const FALLBACK_FONT_ID = "__unicode_fallback";
const HEBREW_FALLBACK_FONT_ID = "__unicode_fallback:hebrew";
const DEVICE_HEBREW_FALLBACKS = ["David", "Arial"] as const;
// FPDF_FONT_TRUETYPE; the trailing `true` makes it a composite (CID) font so
// FPDFText_SetText can address Unicode code points beyond 255.
const FPDF_FONT_TRUETYPE = 2;

let bytesPromise: Promise<Uint8Array | null> | null = null;
let cachedBytes: Uint8Array | null = null;
let hebrewBytesPromise: Promise<Uint8Array | null> | null = null;
let cachedHebrewBytes: Uint8Array | null = null;
let fallbackCoverage: Map<number, number> | null = null;
let hebrewFallbackCoverage: Map<number, number> | null = null;
const deviceFallbackCoverage = new Map<string, Map<number, number> | null>();

// True if the fallback font has a glyph for every non-whitespace code point of
// `text`.
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

function hebrewFallbackFontCovers(text: string): boolean {
  if (!hebrewFallbackCoverage && cachedHebrewBytes) {
    try {
      hebrewFallbackCoverage = parseTrueTypeCmap(cachedHebrewBytes);
    } catch {
      return false;
    }
  }
  if (!hebrewFallbackCoverage) return false;
  const coverage = hebrewFallbackCoverage;
  return [...text].every((ch) => {
    if (/\s/.test(ch)) return true;
    const cp = ch.codePointAt(0);
    return cp !== undefined && coverage.has(cp);
  });
}

function isHebrewText(text: string): boolean {
  return [...text].some((ch) => {
    const cp = ch.codePointAt(0);
    return cp !== undefined && cp >= 0x0590 && cp <= 0x05ff;
  });
}

function covers(family: string, bytes: Uint8Array, text: string): boolean {
  let coverage = deviceFallbackCoverage.get(family);
  if (!deviceFallbackCoverage.has(family)) {
    try {
      coverage = parseTrueTypeCmap(bytes);
    } catch {
      coverage = null;
    }
    deviceFallbackCoverage.set(family, coverage);
  }
  if (!coverage) return true;
  return [...text].every((ch) => {
    if (/\s/.test(ch)) return true;
    const cp = ch.codePointAt(0);
    return cp !== undefined && coverage.has(cp);
  });
}

async function preloadDeviceHebrewFallbacks(): Promise<void> {
  const fonts = loadedLocalFonts();
  if (!fonts || fonts.length === 0) return;
  await Promise.all(
    DEVICE_HEBREW_FALLBACKS.map(async (family) => {
      if (pickLocalFontFace(fonts, family)) await loadLocalFontBytes(family);
    }),
  );
}

function preloadBundledFont(
  url: string,
  current: Promise<Uint8Array | null> | null,
  assign: (bytes: Uint8Array) => void,
  reset: () => void,
): Promise<Uint8Array | null> {
  if (current) return current;
  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        reset();
        return null;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) {
        reset();
        return null;
      }
      assign(bytes);
      return bytes;
    } catch {
      reset();
      return null;
    }
  })();
  return promise;
}

interface ExtendedPdfiumRuntime {
  HEAPU8: Uint8Array;
}

/** Fetch the bundled fallback TTF once. Safe to call repeatedly. */
export function preloadFallbackFontBytes(): Promise<Uint8Array | null> {
  void preloadDeviceHebrewFallbacks();
  bytesPromise = preloadBundledFont(
    FALLBACK_FONT_URL,
    bytesPromise,
    (bytes) => {
      cachedBytes = bytes;
      fallbackCoverage = null;
    },
    () => {
      bytesPromise = null;
    },
  );
  return bytesPromise;
}

/** Preload every bundled face needed to emit this text before PDFium sees it. */
export async function preloadFallbackFontBytesForText(
  text: string,
): Promise<void> {
  await preloadFallbackFontBytes();
  if (!isHebrewText(text)) return;
  hebrewBytesPromise = preloadBundledFont(
    HEBREW_FALLBACK_FONT_URL,
    hebrewBytesPromise,
    (bytes) => {
      cachedHebrewBytes = bytes;
      hebrewFallbackCoverage = null;
    },
    () => {
      hebrewBytesPromise = null;
    },
  );
  await hebrewBytesPromise;
  await preloadDeviceHebrewFallbacks();
}

/** Test/debug hook: bytes are loaded and a fallback emit is possible. */
export function isFallbackFontReady(): boolean {
  return !!cachedBytes && cachedBytes.length > 0;
}

// Embed the Unicode fallback font into `doc` (once) and return its FPDF font
// handle, or 0 when the bytes aren't ready or the load failed.
export function loadFallbackFontInto(doc: EditorDocument): number {
  void preloadFallbackFontBytes();
  return loadFallbackFontIntoBytes(
    doc,
    FALLBACK_FONT_ID,
    "Noto Sans",
    cachedBytes,
    true,
  );
}

function loadFallbackFontIntoBytes(
  doc: EditorDocument,
  id: string,
  family: string,
  bytes: Uint8Array | null,
  bundled: boolean,
): number {
  const existing = doc.ownedFont(id);
  if (existing) return existing.pointer;
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
        id,
        descriptor: {
          id,
          family,
          style: "normal",
          weight: "normal",
          bundled,
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

// Emit ONE text object for `text` in the embedded Unicode fallback font, placed
// at (x, y) with `fill`, inserted into the page.
export function emitFallbackTextObject(
  doc: EditorDocument,
  page: Page,
  text: string,
  size: number,
  fill: RGBA,
  x: number,
  y: number,
): number {
  void preloadFallbackFontBytes();
  const candidates: Array<{
    id: string;
    family: string;
    bytes: Uint8Array | null;
    bundled: boolean;
  }> = [];
  if (isHebrewText(text)) {
    for (const family of DEVICE_HEBREW_FALLBACKS) {
      const bytes = getLocalFontBytes(family);
      if (bytes) {
        candidates.push({
          id: `__unicode_fallback:${family.toLowerCase()}`,
          family,
          bytes,
          bundled: false,
        });
      }
    }
  }
  candidates.push({
    id: isHebrewText(text) ? HEBREW_FALLBACK_FONT_ID : FALLBACK_FONT_ID,
    family: isHebrewText(text) ? "Noto Sans Hebrew" : "Noto Sans",
    bytes: isHebrewText(text) ? cachedHebrewBytes : cachedBytes,
    bundled: true,
  });
  let fb = 0;
  for (const candidate of candidates) {
    if (!candidate.bytes) continue;
    const candidateCovers =
      candidate.id === FALLBACK_FONT_ID
        ? fallbackFontCovers(text)
        : candidate.id === HEBREW_FALLBACK_FONT_ID
          ? hebrewFallbackFontCovers(text)
          : covers(candidate.family, candidate.bytes, text);
    if (!candidateCovers) continue;
    fb = loadFallbackFontIntoBytes(
      doc,
      candidate.id,
      candidate.family,
      candidate.bytes,
      candidate.bundled,
    );
    if (fb) break;
  }
  if (!fb) return 0;
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
