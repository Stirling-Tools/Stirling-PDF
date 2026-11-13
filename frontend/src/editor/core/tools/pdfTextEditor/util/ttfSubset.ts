import { parseTrueTypeCmap } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";

/**
 * Cut a TrueType font down to the glyphs a document uses, WITHOUT renumbering
 * them. Text in a PDF addresses these fonts by glyph id, so every kept glyph
 * must stay at its id: unused glyphs become empty outlines rather than being
 * removed.
 */

// What a PDF viewer needs to draw the font, plus the tables that identify it.
// Layout, bitmap and signature tables are dropped: a PDF never consults them.
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
const CHECKSUM_MAGIC = 0xb1b0afba;
const HEAD_CHECKSUM_ADJUSTMENT = 8;
const HEAD_LOCA_FORMAT = 50;
const MAXP_NUM_GLYPHS = 4;
const HHEA_NUM_H_METRICS = 34;
const POST_HEADER = 32;
const POST_NO_GLYPH_NAMES = 0x00030000;
const SHORT_LOCA_LIMIT = 0x1fffe;

interface Table {
  offset: number;
  length: number;
}

function readTables(dv: DataView): Map<string, Table> | null {
  if (dv.byteLength < 12 || dv.getUint32(0) === TTC_TAG) return null;
  const count = dv.getUint16(4);
  const tables = new Map<string, Table>();
  for (let i = 0; i < count; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > dv.byteLength) return null;
    const tag = String.fromCharCode(
      dv.getUint8(rec),
      dv.getUint8(rec + 1),
      dv.getUint8(rec + 2),
      dv.getUint8(rec + 3),
    );
    const offset = dv.getUint32(rec + 8);
    const length = dv.getUint32(rec + 12);
    if (offset + length > dv.byteLength) return null;
    tables.set(tag, { offset, length });
  }
  return tables;
}

function readLoca(
  dv: DataView,
  loca: Table,
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
  if (end - start < 10 || dv.getInt16(start) >= 0) return [];
  const out: number[] = [];
  let at = start + 10;
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
  glyf: Table,
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

// A cmap left pointing at emptied glyphs would let an editor type characters
// that then draw as nothing, so it is rebuilt to cover only the kept glyphs.
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
  const header = 4 + 2 * 8;
  const subtable = 16 + groups.length * 12;
  const out = new Uint8Array(header + subtable);
  const dv = new DataView(out.buffer);
  dv.setUint16(2, 2);
  dv.setUint16(4, 0); // Unicode platform, full repertoire
  dv.setUint16(6, 4);
  dv.setUint32(8, header);
  dv.setUint16(12, 3); // Windows platform, UCS-4
  dv.setUint16(14, 10);
  dv.setUint32(16, header);
  dv.setUint16(header, 12);
  dv.setUint32(header + 4, subtable);
  dv.setUint32(header + 12, groups.length);
  groups.forEach(([start, end, gid], i) => {
    const at = header + 16 + i * 12;
    dv.setUint32(at, start);
    dv.setUint32(at + 4, end);
    dv.setUint32(at + 8, gid);
  });
  return out;
}

// hmtx holds a full metric for the first `numberOfHMetrics` glyphs and only a
// side bearing for the rest; both runs are cut to the new glyph count.
function truncatedMetrics(
  hhea: Uint8Array,
  hmtx: Uint8Array,
  glyphCount: number,
): Uint8Array | null {
  if (hhea.length < HHEA_NUM_H_METRICS + 2) return null;
  const view = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength);
  const full = view.getUint16(HHEA_NUM_H_METRICS);
  const keptFull = Math.min(full, glyphCount);
  const bearings = glyphCount - keptFull;
  if (full === 0 || hmtx.length < full * 4 + bearings * 2) return null;
  const out = new Uint8Array(keptFull * 4 + bearings * 2);
  out.set(hmtx.subarray(0, keptFull * 4));
  out.set(hmtx.subarray(full * 4, full * 4 + bearings * 2), keptFull * 4);
  view.setUint16(HHEA_NUM_H_METRICS, keptFull);
  return out;
}

function pad4(n: number): number {
  return (n + 3) & ~3;
}

function checksum(bytes: Uint8Array): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  const whole = bytes.length & ~3;
  for (let i = 0; i < whole; i += 4) sum = (sum + dv.getUint32(i)) >>> 0;
  let tail = 0;
  for (let i = whole; i < bytes.length; i++)
    tail |= bytes[i] << (24 - (i - whole) * 8);
  return (sum + (tail >>> 0)) >>> 0;
}

function assemble(
  sfntVersion: number,
  tables: Map<string, Uint8Array>,
): Uint8Array {
  const tags = [...tables.keys()].sort();
  const count = tags.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * 16;
  const directory = 12 + count * 16;
  let size = directory;
  for (const tag of tags) size += pad4(tables.get(tag)!.length);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, sfntVersion);
  dv.setUint16(4, count);
  dv.setUint16(6, searchRange);
  dv.setUint16(8, entrySelector);
  dv.setUint16(10, count * 16 - searchRange);
  let at = directory;
  let headAt = -1;
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!;
    const rec = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[rec + k] = tag.charCodeAt(k);
    dv.setUint32(rec + 4, checksum(data));
    dv.setUint32(rec + 8, at);
    dv.setUint32(rec + 12, data.length);
    out.set(data, at);
    if (tag === "head") headAt = at;
    at += pad4(data.length);
  });
  dv.setUint32(
    headAt + HEAD_CHECKSUM_ADJUSTMENT,
    (CHECKSUM_MAGIC - checksum(out)) >>> 0,
  );
  return out;
}

/**
 * The font with only `usedGlyphs` (and the glyphs they are built from) still
 * drawn, each at its original glyph id. Null when the font is not a single
 * TrueType-outline face this can rewrite safely; the caller then keeps the
 * font whole.
 */
export function subsetTrueType(
  font: Uint8Array,
  usedGlyphs: Iterable<number>,
): Uint8Array | null {
  try {
    const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
    const tables = readTables(dv);
    if (!tables || REQUIRED_TABLES.some((tag) => !tables.has(tag))) return null;
    const head = tables.get("head")!;
    const glyf = tables.get("glyf")!;
    if (head.length < 54 || tables.get("maxp")!.length < 6) return null;
    const long = dv.getInt16(head.offset + HEAD_LOCA_FORMAT) !== 0;
    const numGlyphs = dv.getUint16(
      tables.get("maxp")!.offset + MAXP_NUM_GLYPHS,
    );
    const loca = readLoca(dv, tables.get("loca")!, long, numGlyphs);
    const mapping = parseTrueTypeCmap(font);
    if (!loca || !mapping) return null;
    const kept = closeOverComponents(dv, glyf, loca, usedGlyphs);
    if (!kept) return null;

    // Glyph ids past the last kept one address nothing, so the per-glyph tables
    // stop there instead of carrying an entry for every glyph the font had.
    const glyphCount = Math.max(...kept) + 1;
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

    const out = new Map<string, Uint8Array>();
    for (const [tag, table] of tables) {
      if (!KEPT_TABLES.has(tag)) continue;
      out.set(tag, font.slice(table.offset, table.offset + table.length));
    }
    out.set("glyf", newGlyf);
    out.set("loca", locaBytes);
    out.set("cmap", buildCmap(mapping, kept));
    const hmtx = truncatedMetrics(
      out.get("hhea")!,
      out.get("hmtx")!,
      glyphCount,
    );
    if (!hmtx) return null;
    out.set("hmtx", hmtx);
    new DataView(out.get("maxp")!.buffer).setUint16(
      MAXP_NUM_GLYPHS,
      glyphCount,
    );
    const post = out.get("post");
    if (post && post.length >= POST_HEADER) {
      const header = post.slice(0, POST_HEADER);
      new DataView(header.buffer).setUint32(0, POST_NO_GLYPH_NAMES);
      out.set("post", header);
    }
    new DataView(out.get("head")!.buffer).setUint32(
      HEAD_CHECKSUM_ADJUSTMENT,
      0,
    );
    return assemble(dv.getUint32(0), out);
  } catch {
    return null;
  }
}
