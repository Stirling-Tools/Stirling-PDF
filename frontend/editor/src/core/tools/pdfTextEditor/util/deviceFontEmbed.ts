import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { RGBA } from "@app/tools/pdfTextEditor/types";
import { FontRef } from "@app/tools/pdfTextEditor/model/FontRef";
import { parseTrueTypeCmap } from "@app/tools/pdfTextEditor/charcode/CmapResolver";
import { writeUtf16 } from "@app/services/pdfiumService";
import {
  getLocalFontBytes,
  loadLocalFontBytes,
} from "@app/tools/pdfTextEditor/util/localFonts";
import {
  isBoldFamily,
  isItalicFamily,
} from "@app/tools/pdfTextEditor/util/fontFamily";

// Embed the fonts installed on the user's device instead of substituting the
// nearest standard face. Reading the file is async, so the emit uses the cache.

// Composite (CID) TrueType, so SetText can address code points beyond 255.
const FPDF_FONT_TRUETYPE = 2;
const DEVICE_FONT_ID_PREFIX = "__device_font:";

/** Owned-font id for a family, stable across emits of the same document. */
export function deviceFontIdFor(family: string): string {
  return `${DEVICE_FONT_ID_PREFIX}${family.trim().toLowerCase()}`;
}

interface ExtendedPdfiumRuntime {
  HEAPU8: Uint8Array;
}

interface DeviceFontModule {
  FPDFText_LoadFont?: (
    doc: number,
    data: number,
    size: number,
    fontType: number,
    cid: boolean,
  ) => number;
  FPDFFont_Close?: (font: number) => void;
  FPDFPageObj_CreateTextObj?: (
    doc: number,
    font: number,
    size: number,
  ) => number;
  FPDFPageObj_GetBounds?: (
    obj: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
  ) => boolean;
}

/** Parsed cmap per family, so coverage is computed once per session. */
const coverageByFamily = new Map<string, Map<number, number> | null>();
/** Families PDFium already refused for a document; never retried. */
let refusedByDoc = new WeakMap<EditorDocument, Set<string>>();
/** Successful device-font emits per document, keyed by owned-font id. */
let emitCountByDoc = new WeakMap<EditorDocument, Map<string, number>>();

function refusedFor(doc: EditorDocument): Set<string> {
  let set = refusedByDoc.get(doc);
  if (!set) {
    set = new Set<string>();
    refusedByDoc.set(doc, set);
  }
  return set;
}

/** Test hook: drop the per-session coverage and per-document memos. */
export function resetDeviceFontEmbedCache(): void {
  coverageByFamily.clear();
  refusedByDoc = new WeakMap<EditorDocument, Set<string>>();
  emitCountByDoc = new WeakMap<EditorDocument, Map<string, number>>();
}

// True if the face covers every non-whitespace code point. Fails open, leaving
// the width self-check as the backstop.
function deviceFontCovers(
  family: string,
  bytes: Uint8Array,
  text: string,
): boolean {
  const key = deviceFontIdFor(family);
  if (!coverageByFamily.has(key)) {
    let parsed: Map<number, number> | null = null;
    try {
      parsed = parseTrueTypeCmap(bytes);
    } catch {
      parsed = null;
    }
    coverageByFamily.set(key, parsed);
  }
  const coverage = coverageByFamily.get(key) ?? null;
  if (!coverage) return true;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0);
    if (cp === undefined || !coverage.has(cp)) return false;
  }
  return true;
}

// Read the family's font file so a later synchronous emit can embed it. The UI
// must AWAIT this before dispatching a font-family change.
export async function ensureDeviceFontReady(family: string): Promise<boolean> {
  const bytes = await loadLocalFontBytes(family);
  return !!bytes && bytes.length > 0;
}

/** Whether a synchronous emit can embed this family right now. */
export function isDeviceFontReady(family: string): boolean {
  const bytes = getLocalFontBytes(family);
  return !!bytes && bytes.length > 0;
}

/** Whether `family` is already embedded in `doc`. */
export function isDeviceFontEmbedded(
  doc: EditorDocument,
  family: string,
): boolean {
  return !!doc.ownedFont(deviceFontIdFor(family));
}

/** How many objects this document has emitted in `family`'s embedded face. */
export function deviceFontEmitCount(
  doc: EditorDocument,
  family: string,
): number {
  return emitCountByDoc.get(doc)?.get(deviceFontIdFor(family)) ?? 0;
}

function recordEmit(doc: EditorDocument, family: string): void {
  let counts = emitCountByDoc.get(doc);
  if (!counts) {
    counts = new Map<string, number>();
    emitCountByDoc.set(doc, counts);
  }
  const key = deviceFontIdFor(family);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

// Embed `family` into `doc` once and return its font handle, or 0. Freed with
// the document, along with its backing WASM buffer.
export function loadDeviceFontInto(
  doc: EditorDocument,
  family: string,
): number {
  const id = deviceFontIdFor(family);
  const existing = doc.ownedFont(id);
  if (existing) return existing.pointer;
  const refused = refusedFor(doc);
  // A refusal is permanent for this document; retrying would re-malloc the
  // whole font file on every keystroke.
  if (refused.has(id)) return 0;
  const bytes = getLocalFontBytes(family);
  if (!bytes || bytes.length === 0) return 0;

  const m = doc.module;
  const mod = m as unknown as DeviceFontModule;
  if (typeof mod.FPDFText_LoadFont !== "function") return 0;
  const len = bytes.length;
  const ptr = m.pdfium.wasmExports.malloc(len);
  if (!ptr) return 0;
  try {
    (m.pdfium as typeof m.pdfium & ExtendedPdfiumRuntime).HEAPU8.set(
      bytes,
      ptr,
    );
    const fontPtr = mod.FPDFText_LoadFont(
      doc.docPtr,
      ptr,
      len,
      FPDF_FONT_TRUETYPE,
      true,
    );
    if (!fontPtr) {
      refused.add(id);
      m.pdfium.wasmExports.free(ptr);
      return 0;
    }
    doc.registerOwnedFont(
      new FontRef({
        id,
        descriptor: {
          id,
          family,
          style: isItalicFamily(family) ? "italic" : "normal",
          weight: isBoldFamily(family) ? "bold" : "normal",
          bundled: false,
        },
        pointer: fontPtr,
        owned: true,
        // Free BOTH the font handle and its backing buffer on doc dispose.
        closeFn: (p) => {
          try {
            mod.FPDFFont_Close?.(p);
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
    refused.add(id);
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
  const mod = m as unknown as DeviceFontModule;
  if (typeof mod.FPDFPageObj_GetBounds !== "function") return 0;
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!mod.FPDFPageObj_GetBounds(ptr, l, b, r, t)) return 0;
    return m.pdfium.getValue(r, "float");
  } catch {
    return 0;
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

// Emit one text object in `family`'s embedded face. Returns 0 when the font is
// uncached, refused, lacks the glyphs, or measured ~0-wide - caller substitutes.
export function emitDeviceFontTextObject(
  doc: EditorDocument,
  page: Page,
  family: string,
  text: string,
  size: number,
  fill: RGBA,
  x: number,
  y: number,
): number {
  if (text.length === 0) return 0;
  const bytes = getLocalFontBytes(family);
  if (!bytes || bytes.length === 0) return 0;
  if (!deviceFontCovers(family, bytes, text)) return 0;
  const fontPtr = loadDeviceFontInto(doc, family);
  if (!fontPtr) return 0;
  const m = doc.module;
  const create = (m as unknown as DeviceFontModule).FPDFPageObj_CreateTextObj;
  if (typeof create !== "function") return 0;
  const fp = create(doc.docPtr, fontPtr, size);
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
  recordEmit(doc, family);
  return fp;
}
