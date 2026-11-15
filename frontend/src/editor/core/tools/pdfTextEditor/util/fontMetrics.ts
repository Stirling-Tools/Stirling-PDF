import { parseTrueTypeCmap } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";
import {
  readTableDirectory,
  tableChecksum,
  type SfntTable,
} from "@editor/tools/pdfTextEditor/util/sfnt";

export type FaceKind = "sans" | "serif" | "mono";

export interface FontMetrics {
  cap: number;
  xh: number;
  asc: number;
  advances: Map<number, number>;
  tops: Map<number, number>;
  kind: FaceKind;
  weight: number;
  variableWeight: number | null;
  outlines: string;
}

function kindOf(fixedPitch: boolean, panose: number[] | null): FaceKind {
  if (fixedPitch || panose?.[3] === 9) return "mono";
  const serifStyle = panose?.[1] ?? 0;
  if (serifStyle >= 11) return "sans";
  if (serifStyle >= 2) return "serif";
  return "sans";
}

const WGHT_AXIS = 0x77676874; // "wght"

function defaultWeight(
  dv: DataView,
  fvar: { offset: number } | undefined,
): number | null {
  if (!fvar) return null;
  const axes = fvar.offset + dv.getUint16(fvar.offset + 4);
  const count = dv.getUint16(fvar.offset + 8);
  const size = dv.getUint16(fvar.offset + 10);
  for (let i = 0; i < count; i++) {
    const axis = axes + i * size;
    if (dv.getUint32(axis) !== WGHT_AXIS) continue;
    const max = dv.getInt32(axis + 12) / 65536;
    return max >= 100 ? dv.getInt32(axis + 8) / 65536 : null;
  }
  return null;
}

const FS_TYPE_OFFSET = 8;
const FS_TYPE_USAGE_MASK = 0x000f;
const FS_TYPE_RESTRICTED = 0x0002;
const FS_TYPE_BITMAP_ONLY = 0x0200;

function tablesOf(bytes: Uint8Array): {
  dv: DataView;
  tables: Map<string, SfntTable> | null;
} {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { dv, tables: readTableDirectory(dv) };
}

/** Whether one face's OS/2 fsType forbids embedding it (Restricted Licence, or bitmap-only); no readable OS/2 means no restriction. Must match EditorFontReader on the server. */
export function embeddingForbidden(bytes: Uint8Array): boolean {
  const { dv, tables } = tablesOf(bytes);
  const os2 = tables?.get("OS/2");
  if (!os2 || os2.offset + FS_TYPE_OFFSET + 2 > dv.byteLength) return false;
  const fsType = dv.getUint16(os2.offset + FS_TYPE_OFFSET);
  return (
    (fsType & FS_TYPE_USAGE_MASK) === FS_TYPE_RESTRICTED ||
    (fsType & FS_TYPE_BITMAP_ONLY) !== 0
  );
}

/** Whether one face has TrueType outlines: the editor embeds device fonts as TrueType, and a CFF face saves as a broken font resource. */
export function hasTrueTypeOutlines(bytes: Uint8Array): boolean {
  const { tables } = tablesOf(bytes);
  return !!tables?.has("glyf") && !tables.has("CFF ") && !tables.has("CFF2");
}

const parsed = new WeakMap<Uint8Array, FontMetrics | null>();

export function parseFontMetrics(bytes: Uint8Array): FontMetrics | null {
  if (!parsed.has(bytes)) parsed.set(bytes, readFontMetrics(bytes));
  return parsed.get(bytes) ?? null;
}

function readFontMetrics(bytes: Uint8Array): FontMetrics | null {
  if (bytes.length < 12) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scaler = dv.getUint32(0);
  if (scaler !== 0x00010000 && scaler !== 0x74727565 && scaler !== 0x4f54544f)
    return null;
  try {
    const t = readTableDirectory(dv);
    if (!t) return null;
    const head = t.get("head");
    const hhea = t.get("hhea");
    const hmtx = t.get("hmtx");
    if (!head || !hhea || !hmtx) return null;
    const upm = dv.getUint16(head.offset + 18) || 1000;
    const em = (v: number) => Math.round((v * 1000) / upm);
    const numHMetrics = dv.getUint16(hhea.offset + 34);
    const cmap = parseTrueTypeCmap(bytes);
    if (!cmap || numHMetrics === 0) return null;
    const advanceOf = (gid: number) =>
      dv.getUint16(hmtx.offset + Math.min(gid, numHMetrics - 1) * 4);

    const glyphTop = glyphTopReader(dv, t, head.offset);
    const advances = new Map<number, number>();
    const tops = new Map<number, number>();
    for (const [cp, gid] of cmap) {
      if (gid <= 0) continue;
      advances.set(cp, em(advanceOf(gid)));
      const y = glyphTop(gid);
      if (y !== null) tops.set(cp, em(y));
    }
    if (!advances.has(0x20)) return null;
    const top = (ch: string) => tops.get(ch.charCodeAt(0)) ?? null;

    const os2 = t.get("OS/2");
    let weight = 400;
    let os2Xh = 0;
    let os2Cap = 0;
    let panose: number[] | null = null;
    if (os2 && os2.length >= 78) {
      const version = dv.getUint16(os2.offset);
      weight = dv.getUint16(os2.offset + 4);
      panose = Array.from({ length: 10 }, (_, i) =>
        dv.getUint8(os2.offset + 32 + i),
      );
      if (version >= 2 && os2.length >= 90) {
        os2Xh = em(dv.getInt16(os2.offset + 86));
        os2Cap = em(dv.getInt16(os2.offset + 88));
      }
    }
    const post = t.get("post");
    const fixedPitch = !!post && dv.getUint32(post.offset + 12) !== 0;

    const cap = top("H") ?? (os2Cap || 700);
    const xh = top("x") ?? (os2Xh || Math.round(cap * 0.72));
    const asc = Math.max(cap, top("d") ?? cap);
    return {
      cap,
      xh,
      asc,
      advances,
      tops,
      kind: kindOf(fixedPitch, panose),
      weight,
      variableWeight: defaultWeight(dv, t.get("fvar")),
      outlines: outlinesKey(bytes, t.get("glyf")),
    };
  } catch {
    return null;
  }
}

function outlinesKey(bytes: Uint8Array, glyf: SfntTable | undefined): string {
  if (!glyf) return "";
  const data = bytes.subarray(glyf.offset, glyf.offset + glyf.length);
  return `${tableChecksum(data)}:${glyf.length}`;
}

function glyphTopReader(
  dv: DataView,
  t: Map<string, SfntTable>,
  headOffset: number,
): (gid: number) => number | null {
  const loca = t.get("loca");
  const glyf = t.get("glyf");
  if (!loca || !glyf) return () => null;
  const longOffsets = dv.getInt16(headOffset + 50) === 1;
  return (gid) => {
    const start = longOffsets
      ? dv.getUint32(loca.offset + gid * 4)
      : dv.getUint16(loca.offset + gid * 2) * 2;
    const end = longOffsets
      ? dv.getUint32(loca.offset + (gid + 1) * 4)
      : dv.getUint16(loca.offset + (gid + 1) * 2) * 2;
    if (end <= start) return null;
    return dv.getInt16(glyf.offset + start + 8);
  };
}

export function advanceWidth(
  metrics: Pick<FontMetrics, "advances">,
  text: string,
): number | null {
  let sum = 0;
  for (const ch of text) {
    const adv = metrics.advances.get(ch.codePointAt(0)!);
    if (adv === undefined) return null;
    sum += adv;
  }
  return sum;
}
