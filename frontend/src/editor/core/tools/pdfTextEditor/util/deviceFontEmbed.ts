import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { RGBA } from "@editor/tools/pdfTextEditor/types";
import { FontRef } from "@editor/tools/pdfTextEditor/model/FontRef";
import { parseTrueTypeCmap } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";
import { parseFontMetrics } from "@editor/tools/pdfTextEditor/util/fontMetrics";
import { writeUtf16 } from "@editor/services/pdfiumService";
import {
  externalFaceKey,
  getExternalFontBytes,
  loadExternalFontBytes,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  encodesInBase14,
  isBoldFamily,
  isItalicFamily,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

// Embed the fonts installed on the user's device instead of substituting the
// nearest standard face. Reading the file is async, so the emit uses the cache.

// Composite (CID) TrueType, so SetText can address code points beyond 255.
const FPDF_FONT_TRUETYPE = 2;
const DEVICE_FONT_ID_PREFIX = "__device_font:";

/** Owned-font id for a family, stable across emits of the same document. */
export function deviceFontIdFor(family: string): string {
  return `${DEVICE_FONT_ID_PREFIX}${externalFaceKey(family)}`;
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

/** Parsed cmap per font file: two faces can share a family name, and a document keeps the one it embedded. */
let coverageByBytes = new WeakMap<Uint8Array, Set<number> | null>();
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
  coverageByBytes = new WeakMap<Uint8Array, Set<number> | null>();
  refusedByDoc = new WeakMap<EditorDocument, Set<string>>();
  emitCountByDoc = new WeakMap<EditorDocument, Map<string, number>>();
}

/** Code points the font draws, or null when its tables cannot be read. */
export function fontCoverage(bytes: Uint8Array): Set<number> | null {
  try {
    const mapped =
      parseFontMetrics(bytes)?.advances ?? parseTrueTypeCmap(bytes);
    return mapped ? new Set(mapped.keys()) : null;
  } catch {
    return null;
  }
}

function coverageOf(bytes: Uint8Array): Set<number> | null {
  if (!coverageByBytes.has(bytes))
    coverageByBytes.set(bytes, fontCoverage(bytes));
  return coverageByBytes.get(bytes) ?? null;
}

export function visibleCodePoints(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0);
    if (cp !== undefined) out.push(cp);
  }
  return out;
}

// Whether the face covers every visible code point; fails open to the width self-check.
function deviceFontCovers(bytes: Uint8Array, text: string): boolean {
  const coverage = coverageOf(bytes);
  if (!coverage) return true;
  return visibleCodePoints(text).every((cp) => coverage.has(cp));
}

export function deviceFontCoverage(family: string): Set<number> | null {
  const bytes = getExternalFontBytes(family);
  return bytes ? coverageOf(bytes) : null;
}

/**
 * Whether `draws` has any letter of `text`, or any visible character of text
 * with no letters. Letters decide because digits and punctuation are in every
 * face: a line of another script would count as drawn by a face with none of
 * its words.
 */
export function drawsSomeOf(
  draws: ((codePoint: number) => boolean) | null,
  text: string,
): boolean {
  if (!draws) return true;
  const visible = visibleCodePoints(text);
  const letters = visible.filter((cp) =>
    /\p{L}/u.test(String.fromCodePoint(cp)),
  );
  const judged = letters.length > 0 ? letters : visible;
  return judged.length === 0 || judged.some(draws);
}

// Read the family's font file so a later synchronous emit can embed it. The UI
// must AWAIT this before dispatching a font-family change.
export async function ensureDeviceFontReady(family: string): Promise<boolean> {
  const bytes = await loadExternalFontBytes(family);
  return !!bytes && bytes.length > 0;
}

/** Whether a synchronous emit can embed this family right now. */
export function isDeviceFontReady(family: string): boolean {
  const bytes = getExternalFontBytes(family);
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
/** The family a device font this document loaded was read from, or null for any other font. */
export function deviceFamilyOf(
  doc: EditorDocument,
  fontPtr: number,
): string | null {
  const font = fontPtr ? doc.ownedFontAt(fontPtr) : undefined;
  return font?.id.startsWith(DEVICE_FONT_ID_PREFIX)
    ? font.descriptor.family
    : null;
}

// The bytes of each family a document embedded, by family name. A family keeps the face it was first embedded in for the
// document's life: a server switch can offer a different face under the same name, and a redo must draw what was drawn.
const embeddedBytes = new WeakMap<EditorDocument, Map<string, Uint8Array>>();

function faceBytes(doc: EditorDocument, family: string): Uint8Array | null {
  return (
    embeddedBytes.get(doc)?.get(family) ?? getExternalFontBytes(family) ?? null
  );
}

/**
 * The code points an emit in `family` draws in that family's own face: the
 * face `doc` holds under the name, else the loaded one. A standard font, like a
 * family with no bytes loaded, draws what WinAnsi encodes. Null when the
 * face's tables cannot be read, so nothing is known.
 */
export function familyCoverage(
  doc: EditorDocument | null,
  family: string,
): ((codePoint: number) => boolean) | null {
  if (nearestStandardFont(family) === family) return encodesInBase14;
  const bytes = doc ? faceBytes(doc, family) : getExternalFontBytes(family);
  if (!bytes || bytes.length === 0) return encodesInBase14;
  const coverage = coverageOf(bytes);
  return coverage ? (codePoint) => coverage.has(codePoint) : null;
}

export function loadDeviceFontInto(
  doc: EditorDocument,
  family: string,
): number {
  const id = deviceFontIdFor(family);
  const existing =
    doc.ownedFont(id) ??
    doc.findOwnedFont(
      (font) =>
        font.id.startsWith(DEVICE_FONT_ID_PREFIX) &&
        font.descriptor.family === family,
    );
  if (existing) return existing.pointer;
  const refused = refusedFor(doc);
  // A refusal is permanent for this document; retrying would re-malloc the
  // whole font file on every keystroke.
  if (refused.has(id)) return 0;
  const bytes = getExternalFontBytes(family);
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
    doc.recordEmbeddedFontFile(bytes);
    let kept = embeddedBytes.get(doc);
    if (!kept) embeddedBytes.set(doc, (kept = new Map()));
    kept.set(family, bytes);
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

/** Horizontal extent (PDF points) of an object's visible bbox, or null if unmeasurable. */
function measureInkSpan(
  m: EditorDocument["module"],
  ptr: number,
): { left: number; right: number } | null {
  const mod = m as unknown as DeviceFontModule;
  if (typeof mod.FPDFPageObj_GetBounds !== "function") return null;
  const buf = scratchPtr(m, SCRATCH.editBoxA, 16);
  try {
    if (!mod.FPDFPageObj_GetBounds(ptr, buf, buf + 4, buf + 8, buf + 12)) {
      return null;
    }
    return {
      left: m.pdfium.getValue(buf, "float"),
      right: m.pdfium.getValue(buf + 8, "float"),
    };
  } catch {
    return null;
  }
}

const COMBINING_MARK = /\p{M}/u;

/**
 * Whether an object just drawn at `x` came out too narrow to hold `text`, the
 * sign of a face whose glyphs draw nothing. Combining marks advance the pen by
 * nothing, so they are judged by having ink rather than by width.
 */
export function drawnTooNarrow(
  m: EditorDocument["module"],
  ptr: number,
  text: string,
  size: number,
  x: number,
): boolean {
  const visible = visibleCodePoints(text);
  if (visible.length === 0) return false;
  const ink = measureInkSpan(m, ptr);
  if (!ink) return true;
  const advancing = visible.filter(
    (cp) => !COMBINING_MARK.test(String.fromCodePoint(cp)),
  ).length;
  return advancing > 0
    ? ink.right - x < advancing * size * 0.05
    : ink.right <= ink.left;
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
  const bytes = faceBytes(doc, family);
  if (!bytes || bytes.length === 0) return 0;
  if (!deviceFontCovers(bytes, text)) return 0;
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
  if (drawnTooNarrow(m, fp, text, size, x)) {
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
