import type {
  CharcodeResolver,
  CharcodeResolveResult,
  ResolverContext,
} from "@editor/tools/pdfTextEditor/charcode/CharcodeStrategy";
import { readFontData } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";

// Exact Unicode→charcode lookup for an embedded font, from the font's own
// ToUnicode mapping.
//
// PDFium has no "charcode for this character" call, and its internal reverse
// lookup guesses for subset fonts. The forward direction is exact: write a
// code into a text object (FPDFText_SetCharcodes) and read back what it
// decodes to (FPDFText_GetUnicode). Probing the font's codes once and
// inverting the result gives the true mapping, covering exactly the characters
// the font carries, which is the set that can be drawn in it.

interface ProbeModule {
  FPDFPageObj_CreateTextObj?: (
    doc: number,
    font: number,
    size: number,
  ) => number;
  FPDFText_SetCharcodes?: (
    obj: number,
    codesPtr: number,
    count: number,
  ) => boolean;
  FPDFText_LoadPage?: (page: number) => number;
  FPDFText_ClosePage?: (textPage: number) => void;
  FPDFText_CountChars?: (textPage: number) => number;
  FPDFText_GetUnicode?: (textPage: number, index: number) => number;
  FPDFText_GetTextObject?: (textPage: number, index: number) => number;
  FPDFPage_InsertObject?: (page: number, obj: number) => void;
  FPDFPage_RemoveObject?: (page: number, obj: number) => boolean;
  FPDFPageObj_Destroy?: (obj: number) => void;
  FPDFPageObj_Transform?: (
    obj: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
}

/** Codes probed per batch; one text page load covers a whole batch. */
const BATCH = 256;
/** Upper bound for fonts whose glyph count can't be read (no TrueType program). */
const UNKNOWN_FONT_MAX_CODE = 4096;
/** Never probe past this, whatever the font claims. */
const HARD_MAX_CODE = 65536;

interface FontProbeState {
  /** Unicode code point → lowest charcode that decodes to it. */
  map: Map<number, number>;
  /** Next code to probe; codes below it are done. */
  next: number;
  /** One past the highest code worth probing. */
  limit: number;
  /** The probe could not run at all for this font. */
  failed: boolean;
  /**
   * PDFium decodes a code with no ToUnicode entry as the code number itself
   * (code 66 reads back as "B"). For such fonts a result equal to its own code
   * is noise, not a mapping: the glyph behind it is some other letter.
   */
  identityFallback: boolean;
}

const fontState = new Map<number, FontProbeState>();

export class ToUnicodeResolver implements CharcodeResolver {
  readonly name = "tounicode" as const;

  resolve(
    font: number,
    text: string,
    ctx: ResolverContext,
  ): CharcodeResolveResult | null {
    if (!font || !ctx.pagePtr || !ctx.docPtr) return null;
    const wanted = new Set<number>();
    for (const ch of text) wanted.add(ch.codePointAt(0) ?? 0);
    const state = ensureCovered(font, wanted, ctx);
    if (state.failed) return null;
    const charcodes: number[] = [];
    const missing: string[] = [];
    for (const ch of text) {
      const code = state.map.get(ch.codePointAt(0) ?? 0);
      if (code === undefined) {
        missing.push(ch);
        continue;
      }
      charcodes.push(code);
    }
    return {
      charcodes,
      coverage: charcodes.length,
      missing,
      note: `tounicode entries: ${state.map.size}, probed: ${state.next}/${state.limit}, resolved: ${charcodes.length}/${[...text].length}`,
    };
  }
}

/** Probe further batches until every wanted code point is mapped or the font is exhausted. */
function ensureCovered(
  font: number,
  wanted: Set<number>,
  ctx: ResolverContext,
): FontProbeState {
  let state = fontState.get(font);
  if (!state) {
    const limit = probeLimit(font, ctx);
    // A code past anything the font holds: if it still decodes to itself,
    // PDFium is falling back to the raw code for unmapped entries.
    const sentinel = Math.min(0xfff0, Math.max(limit, 256) + 1000);
    const probe = probeCodes(font, [sentinel], ctx);
    state = {
      map: new Map(),
      next: 0,
      limit,
      failed: probe === null,
      identityFallback: probe?.get(sentinel) === sentinel,
    };
    fontState.set(font, state);
  }
  const allKnown = () => [...wanted].every((cp) => state.map.has(cp));
  while (!state.failed && state.next < state.limit && !allKnown()) {
    const end = Math.min(state.limit, state.next + BATCH);
    const codes: number[] = [];
    for (let code = state.next; code < end; code++) codes.push(code);
    const decoded = probeCodes(font, codes, ctx);
    if (!decoded) {
      // Nothing probed at all: this build or font can't be read this way.
      if (state.next === 0) state.failed = true;
      break;
    }
    // Ascending code order, so the lowest code wins: single-byte fonts
    // truncate high codes onto low ones.
    for (const code of codes) {
      const cp = decoded.get(code);
      if (cp === undefined || cp < 0x20) continue;
      if (state.identityFallback && cp === code) continue;
      if (!state.map.has(cp)) state.map.set(cp, code);
    }
    state.next = end;
  }
  return state;
}

/** One past the highest charcode this font can hold. */
function probeLimit(font: number, ctx: ResolverContext): number {
  const glyphs = trueTypeGlyphCount(readFontData(font, ctx.module));
  if (glyphs !== null) {
    // Identity-mapped CID fonts use glyph ids as codes; single-byte fonts stay
    // under 256 either way.
    return Math.min(HARD_MAX_CODE, Math.max(256, glyphs));
  }
  return UNKNOWN_FONT_MAX_CODE;
}

/** numGlyphs from a TrueType/OpenType `maxp` table, or null. */
export function trueTypeGlyphCount(bytes: Uint8Array | null): number | null {
  if (!bytes || bytes.length < 12) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.length) return null;
    const tag = String.fromCharCode(
      bytes[rec],
      bytes[rec + 1],
      bytes[rec + 2],
      bytes[rec + 3],
    );
    if (tag !== "maxp") continue;
    const offset = dv.getUint32(rec + 8);
    if (offset + 6 > bytes.length) return null;
    const count = dv.getUint16(offset + 4);
    return count > 0 ? count : null;
  }
  return null;
}

/**
 * Write each code into its own scratch text object on the page, read back what
 * it decodes to, then remove and free every scratch object. Returns
 * code → code point for codes that decode to exactly one character, or null
 * when the probe can't run.
 */
function probeCodes(
  font: number,
  codes: number[],
  ctx: ResolverContext,
): Map<number, number> | null {
  const m = ctx.module as unknown as ProbeModule;
  if (
    !m.FPDFPageObj_CreateTextObj ||
    !m.FPDFText_SetCharcodes ||
    !m.FPDFText_LoadPage ||
    !m.FPDFText_CountChars ||
    !m.FPDFText_GetUnicode ||
    !m.FPDFText_GetTextObject ||
    !m.FPDFPage_InsertObject ||
    !m.FPDFPage_RemoveObject
  ) {
    return null;
  }
  const heap = () =>
    (ctx.module.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
  const codeBuf = ctx.module.pdfium.wasmExports.malloc(4);
  if (!codeBuf) return null;
  const objToCode = new Map<number, number>();
  try {
    codes.forEach((code, slot) => {
      const obj = m.FPDFPageObj_CreateTextObj!(ctx.docPtr, font, 10);
      if (!obj) return;
      new Uint32Array(heap().buffer, codeBuf, 1)[0] = code >>> 0;
      if (!m.FPDFText_SetCharcodes!(obj, codeBuf, 1)) {
        m.FPDFPageObj_Destroy?.(obj);
        return;
      }
      // Spread the probes out: PDFium's text page drops characters that sit
      // exactly on top of each other as duplicates.
      m.FPDFPageObj_Transform?.(
        obj,
        1,
        0,
        0,
        1,
        (slot % 32) * 20,
        Math.floor(slot / 32) * 20,
      );
      m.FPDFPage_InsertObject!(ctx.pagePtr, obj);
      objToCode.set(obj, code);
    });
    if (objToCode.size === 0) return null;
    const textPage = m.FPDFText_LoadPage(ctx.pagePtr);
    if (!textPage) return null;
    const units = new Map<number, number[]>();
    try {
      const count = m.FPDFText_CountChars(textPage);
      for (let i = 0; i < count; i++) {
        const obj = m.FPDFText_GetTextObject(textPage, i);
        if (!objToCode.has(obj)) continue;
        const unicode = m.FPDFText_GetUnicode(textPage, i);
        if (!unicode) continue;
        const list = units.get(obj) ?? [];
        list.push(unicode);
        units.set(obj, list);
      }
    } finally {
      m.FPDFText_ClosePage?.(textPage);
    }
    const out = new Map<number, number>();
    for (const [obj, list] of units) {
      // Ligature codes decode to several characters and don't count.
      const cp = codePointOf(list);
      if (cp !== null) out.set(objToCode.get(obj)!, cp);
    }
    return out;
  } finally {
    for (const obj of objToCode.keys()) {
      try {
        m.FPDFPage_RemoveObject(ctx.pagePtr, obj);
      } catch {
        /* best-effort */
      }
      try {
        m.FPDFPageObj_Destroy?.(obj);
      } catch {
        /* best-effort */
      }
    }
    ctx.module.pdfium.wasmExports.free(codeBuf);
  }
}

/** One code point from the UTF-16 units of one decoded character, else null. */
function codePointOf(units: number[]): number | null {
  if (units.length === 1) {
    const u = units[0];
    return u >= 0xd800 && u <= 0xdfff ? null : u;
  }
  if (units.length === 2 && units[0] >= 0xd800 && units[0] <= 0xdbff) {
    return ((units[0] - 0xd800) << 10) + (units[1] - 0xdc00) + 0x10000;
  }
  return null;
}

/** Forget every probed font (new document). */
export function resetToUnicodeCache(): void {
  fontState.clear();
}

/** Test-only alias for {@link resetToUnicodeCache}. */
export function _clearToUnicodeCacheForTests(): void {
  resetToUnicodeCache();
}
