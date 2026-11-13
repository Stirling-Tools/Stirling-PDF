import { parseTrueTypeCmap } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";
import {
  assembleSfnt,
  pad4,
  readTableDirectory,
  type SfntTable,
} from "@editor/tools/pdfTextEditor/util/sfnt";

/** Subset a TrueType font without renumbering: PDF text addresses glyphs by id, so unused ones empty. */

// Tables a PDF viewer reads to draw and identify the font; layout and bitmap tables are dropped.
const KEPT_TABLES = new Set([
  "head",
  "hhea",
  "maxp",
  "loca",
  "glyf",
  "hmtx",
  "cvt ",
  "fpgm",
  "prep",
  "cmap",
  "OS/2",
  "name",
  "post",
  "gasp",
]);
const REQUIRED_TABLES = ["head", "hhea", "maxp", "loca", "glyf", "hmtx"];

const TTC_TAG = 0x74746366;
const MORE_COMPONENTS = 0x0020;
const ARGS_ARE_WORDS = 0x0001;
const HAS_SCALE = 0x0008;
const HAS_XY_SCALE = 0x0040;
const HAS_TWO_BY_TWO = 0x0080;
const HEAD_MIN_LENGTH = 54;
const HEAD_LOCA_FORMAT = 50;
const MAXP_MIN_LENGTH = 6;
const MAXP_NUM_GLYPHS = 4;
const HHEA_NUM_H_METRICS = 34;
const LONG_METRIC_SIZE = 4;
const BEARING_SIZE = 2;
const GLYPH_HEADER_SIZE = 10;
const POST_HEADER = 32;
const POST_NO_GLYPH_NAMES = 0x00030000;
const SHORT_LOCA_LIMIT = 0x1fffe;
const CMAP_HEADER_SIZE = 4;
const CMAP_ENCODING_RECORD_SIZE = 8;
const CMAP_FORMAT_12 = 12;
const FORMAT_12_HEADER_SIZE = 16;
const FORMAT_12_GROUP_SIZE = 12;
const PLATFORM_UNICODE = 0;
const UNICODE_FULL_REPERTOIRE = 4;
const PLATFORM_WINDOWS = 3;
const WINDOWS_UCS4 = 10;
const OS2_FS_TYPE = 8;
const FS_TYPE_NO_SUBSETTING = 0x0100;

interface GlyphTables {
  glyf: Uint8Array;
  loca: Uint8Array;
}

function readTables(dv: DataView): Map<string, SfntTable> | null {
  const tables = readTableDirectory(dv);
  if (!tables || dv.getUint32(0) === TTC_TAG) return null;
  for (const { offset, length } of tables.values())
    if (offset + length > dv.byteLength) return null;
  return tables;
}

function readLoca(
  dv: DataView,
  loca: SfntTable,
  long: boolean,
  numGlyphs: number,
): number[] | null {
  const width = long ? 4 : 2;
  if (loca.length < (numGlyphs + 1) * width) return null;
  const offsets: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    const at = loca.offset + i * width;
    offsets.push(long ? dv.getUint32(at) : dv.getUint16(at) * 2);
  }
  return offsets;
}

// A composite glyph draws other glyphs by id, so they must be kept with it.
function componentsOf(dv: DataView, start: number, end: number): number[] {
  if (end - start < GLYPH_HEADER_SIZE || dv.getInt16(start) >= 0) return [];
  const out: number[] = [];
  let at = start + GLYPH_HEADER_SIZE;
  while (at + 4 <= end) {
    const flags = dv.getUint16(at);
    out.push(dv.getUint16(at + 2));
    at += 4 + (flags & ARGS_ARE_WORDS ? 4 : 2);
    if (flags & HAS_SCALE) at += 2;
    else if (flags & HAS_XY_SCALE) at += 4;
    else if (flags & HAS_TWO_BY_TWO) at += 8;
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return out;
}

function closeOverComponents(
  dv: DataView,
  glyf: SfntTable,
  loca: number[],
  wanted: Iterable<number>,
): Set<number> | null {
  const numGlyphs = loca.length - 1;
  const kept = new Set<number>([0]);
  const queue: number[] = [];
  for (const gid of wanted) {
    if (gid > 0 && gid < numGlyphs && !kept.has(gid)) {
      kept.add(gid);
      queue.push(gid);
    }
  }
  queue.push(0);
  while (queue.length > 0) {
    const gid = queue.pop()!;
    const start = glyf.offset + loca[gid];
    const end = glyf.offset + loca[gid + 1];
    if (end < start || end > glyf.offset + glyf.length) return null;
    for (const part of componentsOf(dv, start, end)) {
      if (part < numGlyphs && !kept.has(part)) {
        kept.add(part);
        queue.push(part);
      }
    }
  }
  return kept;
}

// Rebuild the cmap for kept glyphs only, or editors could type characters that draw nothing.
function buildCmap(
  mapping: Map<number, number>,
  kept: Set<number>,
): Uint8Array {
  const pairs = [...mapping]
    .filter(([, gid]) => gid > 0 && kept.has(gid))
    .sort((a, b) => a[0] - b[0]);
  const groups: Array<[number, number, number]> = [];
  for (const [cp, gid] of pairs) {
    const last = groups[groups.length - 1];
    if (last && cp === last[1] + 1 && gid === last[2] + (cp - last[0])) {
      last[1] = cp;
    } else {
      groups.push([cp, cp, gid]);
    }
  }
  const header = CMAP_HEADER_SIZE + 2 * CMAP_ENCODING_RECORD_SIZE;
  const subtable = FORMAT_12_HEADER_SIZE + groups.length * FORMAT_12_GROUP_SIZE;
  const out = new Uint8Array(header + subtable);
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 2);
  dv.setUint16(4, PLATFORM_UNICODE);
  dv.setUint16(6, UNICODE_FULL_REPERTOIRE);
  dv.setUint32(8, header);
  dv.setUint16(12, PLATFORM_WINDOWS);
  dv.setUint16(14, WINDOWS_UCS4);
  dv.setUint32(16, header);
  dv.setUint16(header, CMAP_FORMAT_12);
  dv.setUint32(header + 4, subtable);
  dv.setUint32(header + 12, groups.length);
  groups.forEach(([start, end, gid], i) => {
    const at = header + FORMAT_12_HEADER_SIZE + i * FORMAT_12_GROUP_SIZE;
    dv.setUint32(at, start);
    dv.setUint32(at + 4, end);
    dv.setUint32(at + 8, gid);
  });
  return out;
}

// hmtx has full metrics for numberOfHMetrics glyphs then bearings only; both are cut to the new count.
function truncatedMetrics(
  hhea: Uint8Array,
  hmtx: Uint8Array,
  glyphCount: number,
): { hmtx: Uint8Array; numberOfHMetrics: number } | null {
  if (hhea.length < HHEA_NUM_H_METRICS + 2) return null;
  const full = new DataView(
    hhea.buffer,
    hhea.byteOffset,
    hhea.byteLength,
  ).getUint16(HHEA_NUM_H_METRICS);
  const keptFull = Math.min(full, glyphCount);
  const bearings = glyphCount - keptFull;
  const fullSize = full * LONG_METRIC_SIZE;
  const keptSize = keptFull * LONG_METRIC_SIZE;
  if (full === 0 || hmtx.length < fullSize + bearings * BEARING_SIZE)
    return null;
  const out = new Uint8Array(keptSize + bearings * BEARING_SIZE);
  out.set(hmtx.subarray(0, keptSize));
  out.set(
    hmtx.subarray(fullSize, fullSize + bearings * BEARING_SIZE),
    keptSize,
  );
  return { hmtx: out, numberOfHMetrics: keptFull };
}

function rebuildGlyf(
  font: Uint8Array,
  glyf: SfntTable,
  loca: number[],
  kept: Set<number>,
  glyphCount: number,
  long: boolean,
): GlyphTables | null {
  const newLoca: number[] = [0];
  const pieces: Uint8Array[] = [];
  let size = 0;
  for (let gid = 0; gid < glyphCount; gid++) {
    if (kept.has(gid) && loca[gid + 1] > loca[gid]) {
      const data = font.subarray(
        glyf.offset + loca[gid],
        glyf.offset + loca[gid + 1],
      );
      const padded = new Uint8Array(pad4(data.length));
      padded.set(data);
      pieces.push(padded);
      size += padded.length;
    }
    newLoca.push(size);
  }
  if (!long && size > SHORT_LOCA_LIMIT) return null;
  const newGlyf = new Uint8Array(size);
  let at = 0;
  for (const piece of pieces) {
    newGlyf.set(piece, at);
    at += piece.length;
  }
  const locaBytes = new Uint8Array(newLoca.length * (long ? 4 : 2));
  const locaView = new DataView(locaBytes.buffer);
  newLoca.forEach((offset, i) => {
    if (long) locaView.setUint32(i * 4, offset);
    else locaView.setUint16(i * 2, offset / 2);
  });
  return { glyf: newGlyf, loca: locaBytes };
}

function withoutGlyphNames(post: Uint8Array): Uint8Array | null {
  if (post.length < POST_HEADER) return null;
  const header = post.slice(0, POST_HEADER);
  new DataView(header.buffer).setUint32(0, POST_NO_GLYPH_NAMES);
  return header;
}

function forbidsSubsetting(dv: DataView, os2: SfntTable | undefined): boolean {
  if (!os2 || os2.length < OS2_FS_TYPE + 2) return false;
  return (dv.getUint16(os2.offset + OS2_FS_TYPE) & FS_TYPE_NO_SUBSETTING) !== 0;
}

/** The font with only usedGlyphs drawn, at their ids; null when it is not one TrueType face or its OS/2 fsType forbids subsetting. */
export function subsetTrueType(
  font: Uint8Array,
  usedGlyphs: Iterable<number>,
): Uint8Array | null {
  try {
    const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
    const tables = readTables(dv);
    if (!tables || REQUIRED_TABLES.some((tag) => !tables.has(tag))) return null;
    if (forbidsSubsetting(dv, tables.get("OS/2"))) return null;
    const head = tables.get("head")!;
    const maxp = tables.get("maxp")!;
    const glyf = tables.get("glyf")!;
    if (head.length < HEAD_MIN_LENGTH || maxp.length < MAXP_MIN_LENGTH)
      return null;
    const long = dv.getInt16(head.offset + HEAD_LOCA_FORMAT) !== 0;
    const numGlyphs = dv.getUint16(maxp.offset + MAXP_NUM_GLYPHS);
    const loca = readLoca(dv, tables.get("loca")!, long, numGlyphs);
    const mapping = parseTrueTypeCmap(font);
    if (!loca || !mapping) return null;
    const kept = closeOverComponents(dv, glyf, loca, usedGlyphs);
    if (!kept) return null;

    // Per-glyph tables stop at the last kept glyph id.
    const glyphCount = Math.max(...kept) + 1;
    const glyphs = rebuildGlyf(font, glyf, loca, kept, glyphCount, long);
    if (!glyphs) return null;

    const out = new Map<string, Uint8Array>();
    for (const [tag, table] of tables) {
      if (!KEPT_TABLES.has(tag)) continue;
      out.set(tag, font.slice(table.offset, table.offset + table.length));
    }
    out.set("glyf", glyphs.glyf);
    out.set("loca", glyphs.loca);
    out.set("cmap", buildCmap(mapping, kept));
    const hhea = out.get("hhea")!;
    const metrics = truncatedMetrics(hhea, out.get("hmtx")!, glyphCount);
    if (!metrics) return null;
    out.set("hmtx", metrics.hmtx);
    new DataView(hhea.buffer).setUint16(
      HHEA_NUM_H_METRICS,
      metrics.numberOfHMetrics,
    );
    new DataView(out.get("maxp")!.buffer).setUint16(
      MAXP_NUM_GLYPHS,
      glyphCount,
    );
    const post = out.get("post");
    const namelessPost = post && withoutGlyphNames(post);
    if (namelessPost) out.set("post", namelessPost);
    return assembleSfnt(dv.getUint32(0), out);
  } catch {
    return null;
  }
}
