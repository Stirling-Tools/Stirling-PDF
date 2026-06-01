import type {
  CharcodeResolver,
  CharcodeResolveResult,
  ResolverContext,
} from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

/**
 * Strategy 1: parse the embedded font's cmap table.
 *
 * The PDF's embedded font (TrueType/OpenType) carries a `cmap` table
 * whose subtables map Unicode codepoints to font-internal glyph
 * indices. For subset fonts the cmap is trimmed to just the chars
 * the original text used - but PDFium's `FPDFText_SetCharcodes` uses
 * those same indices as the "charcode" argument for CIDFontType2
 * subset fonts, so the glyph_index from the cmap IS the value we
 * want to pass.
 *
 * We support the two cmap subtable formats that cover ~99% of real
 * PDF fonts:
 *   - Format 4 (segmented mappings to 16-bit glyph indices) - the
 *     default for BMP-only TrueType fonts, most modern Western
 *     fonts.
 *   - Format 6 (trimmed 16-bit table) - simpler, sometimes used for
 *     subsetted fonts where the codepoint range is small.
 *   - Format 12 (sparse 32-bit ranges) - for fonts that need
 *     codepoints above U+FFFF (emoji, CJK extension B+).
 *
 * Subtables we don't try to parse (rare in real PDFs):
 *   - Formats 0, 2, 8, 10, 13, 14 - return null, caller falls back.
 */

interface FontDataModule {
  FPDFFont_GetFontData?: (
    font: number,
    bufferPtr: number,
    length: number,
    outSizePtr: number,
  ) => boolean;
}

/** Per-font cmap cache. Keyed by font pointer (stable per document). */
const cmapCache = new Map<number, Map<number, number> | null>();

export class CmapResolver implements CharcodeResolver {
  readonly name = "cmap" as const;

  resolve(
    font: number,
    text: string,
    ctx: ResolverContext,
  ): CharcodeResolveResult | null {
    if (!font) return null;
    const cmap = getOrBuildCmap(font, ctx);
    if (!cmap) {
      return {
        charcodes: [],
        coverage: 0,
        missing: [...text],
        note: "cmap unavailable for this font",
      };
    }
    const charcodes: number[] = [];
    const missing: string[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const gid = cmap.get(cp);
      if (gid === undefined) {
        missing.push(ch);
        continue;
      }
      charcodes.push(gid);
    }
    return {
      charcodes,
      coverage: charcodes.length,
      missing,
      note: `cmap entries: ${cmap.size}, requested: ${text.length}, resolved: ${charcodes.length}`,
    };
  }
}

function getOrBuildCmap(
  font: number,
  ctx: ResolverContext,
): Map<number, number> | null {
  const cached = cmapCache.get(font);
  if (cached !== undefined) return cached;
  const built = buildCmap(font, ctx);
  cmapCache.set(font, built);
  return built;
}

function buildCmap(
  font: number,
  ctx: ResolverContext,
): Map<number, number> | null {
  const m = ctx.module;
  const fontMod = m as unknown as FontDataModule;
  if (!fontMod.FPDFFont_GetFontData) return null;

  // First call: ask for the buffer size (pass length=0, read outSize).
  const sizePtr = m.pdfium.wasmExports.malloc(4);
  try {
    const ok = fontMod.FPDFFont_GetFontData(font, 0, 0, sizePtr);
    if (!ok) return null;
    const size = m.pdfium.getValue(sizePtr, "i32");
    if (size <= 0) return null;
    const dataPtr = m.pdfium.wasmExports.malloc(size);
    try {
      const ok2 = fontMod.FPDFFont_GetFontData(font, dataPtr, size, sizePtr);
      if (!ok2) return null;
      // Slice() copies out of the WASM heap so we own the bytes.
      const heapU8 = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
      const bytes = new Uint8Array(heapU8.buffer, dataPtr, size).slice();
      return parseTrueTypeCmap(bytes);
    } finally {
      m.pdfium.wasmExports.free(dataPtr);
    }
  } finally {
    m.pdfium.wasmExports.free(sizePtr);
  }
}

/**
 * Minimal TrueType / OpenType cmap parser. Returns a Map of
 * Unicode codepoint → glyph index, or null if the font has no
 * usable cmap.
 *
 * Reference: https://learn.microsoft.com/en-us/typography/opentype/spec/cmap
 */
export function parseTrueTypeCmap(
  bytes: Uint8Array,
): Map<number, number> | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) return null;

  // sfnt header: first 4 bytes are the scaler type
  // (0x00010000 for TrueType, 'OTTO' for OpenType/CFF, 'true', 'typ1').
  const scaler = dv.getUint32(0);
  const isOpenTypeCff = scaler === 0x4f54544f; // 'OTTO'
  const isTrueType =
    scaler === 0x00010000 ||
    scaler === 0x74727565 || // 'true'
    scaler === 0x74797031; // 'typ1'
  if (!isOpenTypeCff && !isTrueType) return null;

  const numTables = dv.getUint16(4);
  const tableRecordStart = 12;
  // Find the 'cmap' table record.
  let cmapOffset = 0;
  for (let i = 0; i < numTables; i++) {
    const recordOffset = tableRecordStart + i * 16;
    if (recordOffset + 16 > bytes.length) return null;
    const tag = dv.getUint32(recordOffset);
    if (tag === 0x636d6170) {
      // 'cmap'
      cmapOffset = dv.getUint32(recordOffset + 8);
      break;
    }
  }
  if (cmapOffset === 0 || cmapOffset + 4 > bytes.length) return null;

  const numSubtables = dv.getUint16(cmapOffset + 2);
  // Pick the best subtable: prefer Unicode platform (0), then
  // Microsoft Unicode (3, encoding 1 or 10).
  let bestSubtableOffset = 0;
  let bestRank = -1;
  for (let i = 0; i < numSubtables; i++) {
    const recordOffset = cmapOffset + 4 + i * 8;
    if (recordOffset + 8 > bytes.length) continue;
    const platformId = dv.getUint16(recordOffset);
    const encodingId = dv.getUint16(recordOffset + 2);
    const subtableOffset = cmapOffset + dv.getUint32(recordOffset + 4);
    const rank = rankSubtable(platformId, encodingId);
    if (rank > bestRank) {
      bestRank = rank;
      bestSubtableOffset = subtableOffset;
    }
  }
  if (bestSubtableOffset === 0) return null;

  const format = dv.getUint16(bestSubtableOffset);
  if (format === 4) return parseFormat4(dv, bestSubtableOffset);
  if (format === 6) return parseFormat6(dv, bestSubtableOffset);
  if (format === 12) return parseFormat12(dv, bestSubtableOffset);
  return null;
}

function rankSubtable(platformId: number, encodingId: number): number {
  // Microsoft Unicode UCS-4 (3, 10) is the highest priority -
  // covers chars above U+FFFF. Then Microsoft Unicode BMP (3, 1).
  // Then Unicode platform (0, any). Everything else lowest.
  if (platformId === 3 && encodingId === 10) return 100;
  if (platformId === 0 && encodingId === 4) return 90;
  if (platformId === 0 && encodingId === 6) return 90;
  if (platformId === 3 && encodingId === 1) return 80;
  if (platformId === 0) return 70;
  return 0;
}

/** Format 4: segment-mapping-to-delta. The most common cmap subtable. */
function parseFormat4(
  dv: DataView,
  offset: number,
): Map<number, number> | null {
  const length = dv.getUint16(offset + 2);
  if (offset + length > dv.byteLength) return null;
  const segCountX2 = dv.getUint16(offset + 6);
  const segCount = segCountX2 / 2;
  const endCodesOffset = offset + 14;
  const startCodesOffset = endCodesOffset + segCountX2 + 2;
  const idDeltasOffset = startCodesOffset + segCountX2;
  const idRangeOffsetsOffset = idDeltasOffset + segCountX2;
  const glyphIdArrayOffset = idRangeOffsetsOffset + segCountX2;
  const out = new Map<number, number>();
  for (let i = 0; i < segCount; i++) {
    const endCode = dv.getUint16(endCodesOffset + i * 2);
    const startCode = dv.getUint16(startCodesOffset + i * 2);
    const idDelta = dv.getInt16(idDeltasOffset + i * 2);
    const idRangeOffset = dv.getUint16(idRangeOffsetsOffset + i * 2);
    if (startCode === 0xffff && endCode === 0xffff) continue;
    for (let c = startCode; c <= endCode; c++) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (c + idDelta) & 0xffff;
      } else {
        // The spec's idRangeOffset trick: an offset INTO the
        // idRangeOffset array itself that points to the glyphIdArray.
        const glyphIdOffset =
          idRangeOffsetsOffset + i * 2 + idRangeOffset + (c - startCode) * 2;
        if (
          glyphIdOffset + 2 >
          glyphIdArrayOffset + (length - (glyphIdArrayOffset - offset))
        ) {
          continue;
        }
        const raw = dv.getUint16(glyphIdOffset);
        if (raw === 0) continue;
        glyphId = (raw + idDelta) & 0xffff;
      }
      if (glyphId !== 0) out.set(c, glyphId);
    }
  }
  return out;
}

/** Format 6: trimmed table mapping. Compact contiguous range. */
function parseFormat6(dv: DataView, offset: number): Map<number, number> {
  const firstCode = dv.getUint16(offset + 6);
  const entryCount = dv.getUint16(offset + 8);
  const out = new Map<number, number>();
  for (let i = 0; i < entryCount; i++) {
    const glyphId = dv.getUint16(offset + 10 + i * 2);
    if (glyphId !== 0) out.set(firstCode + i, glyphId);
  }
  return out;
}

/** Format 12: segmented coverage for chars above U+FFFF (emoji etc.). */
function parseFormat12(dv: DataView, offset: number): Map<number, number> {
  const numGroups = dv.getUint32(offset + 12);
  const groupsOffset = offset + 16;
  const out = new Map<number, number>();
  for (let i = 0; i < numGroups; i++) {
    const recordOffset = groupsOffset + i * 12;
    const startCharCode = dv.getUint32(recordOffset);
    const endCharCode = dv.getUint32(recordOffset + 4);
    const startGlyphId = dv.getUint32(recordOffset + 8);
    for (let c = startCharCode; c <= endCharCode; c++) {
      const gid = startGlyphId + (c - startCharCode);
      if (gid !== 0) out.set(c, gid);
    }
  }
  return out;
}

/** Test-only: clear the per-font cache. */
export function _clearCmapCacheForTests(): void {
  cmapCache.clear();
}
