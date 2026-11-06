import { parseTrueTypeCmap } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";

export type FaceKind = "sans" | "serif" | "mono";

export interface FontMetrics {
  cap: number;
  xh: number;
  asc: number;
  advances: Map<number, number>;
  kind: FaceKind;
  weight: number;
  restricted: boolean;
}

const TAG = (s: string) =>
  (s.charCodeAt(0) << 24) |
  (s.charCodeAt(1) << 16) |
  (s.charCodeAt(2) << 8) |
  s.charCodeAt(3);

const LATIN_EXTRAS = [
  0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac,
];

function tables(dv: DataView): Map<number, { offset: number; length: number }> {
  const out = new Map<number, { offset: number; length: number }>();
  const count = dv.getUint16(4);
  for (let i = 0; i < count; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > dv.byteLength) break;
    out.set(dv.getUint32(rec) | 0, {
      offset: dv.getUint32(rec + 8),
      length: dv.getUint32(rec + 12),
    });
  }
  return out;
}

function kindOf(fixedPitch: boolean, panose: number[] | null): FaceKind {
  if (fixedPitch || panose?.[3] === 9) return "mono";
  const serifStyle = panose?.[1] ?? 0;
  if (serifStyle >= 11) return "sans";
  if (serifStyle >= 2) return "serif";
  return "sans";
}

export function parseFontMetrics(bytes: Uint8Array): FontMetrics | null {
  if (bytes.length < 12) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scaler = dv.getUint32(0);
  if (scaler !== 0x00010000 && scaler !== 0x74727565 && scaler !== 0x4f54544f)
    return null;
  try {
    const t = tables(dv);
    const head = t.get(TAG("head"));
    const hhea = t.get(TAG("hhea"));
    const hmtx = t.get(TAG("hmtx"));
    if (!head || !hhea || !hmtx) return null;
    const upm = dv.getUint16(head.offset + 18) || 1000;
    const em = (v: number) => Math.round((v * 1000) / upm);
    const numHMetrics = dv.getUint16(hhea.offset + 34);
    const cmap = parseTrueTypeCmap(bytes);
    if (!cmap || numHMetrics === 0) return null;
    const advanceOf = (gid: number) =>
      dv.getUint16(hmtx.offset + Math.min(gid, numHMetrics - 1) * 4);

    const advances = new Map<number, number>();
    const codes = [...Array.from({ length: 224 }, (_, i) => i + 32)].concat(
      LATIN_EXTRAS,
    );
    for (const cp of codes) {
      const gid = cmap.get(cp);
      if (gid !== undefined && gid > 0) advances.set(cp, em(advanceOf(gid)));
    }
    if (!advances.has(0x20) || !advances.has(0x61)) return null;

    const glyphTop = glyphTopReader(dv, t, head.offset);
    const top = (ch: string) => {
      const gid = cmap.get(ch.charCodeAt(0));
      const y = gid ? glyphTop(gid) : null;
      return y === null ? null : em(y);
    };

    const os2 = t.get(TAG("OS/2"));
    let weight = 400;
    let restricted = false;
    let os2Xh = 0;
    let os2Cap = 0;
    let panose: number[] | null = null;
    if (os2 && os2.length >= 78) {
      const version = dv.getUint16(os2.offset);
      weight = dv.getUint16(os2.offset + 4);
      restricted = (dv.getUint16(os2.offset + 8) & 0x000f) === 0x0002;
      panose = Array.from({ length: 10 }, (_, i) =>
        dv.getUint8(os2.offset + 32 + i),
      );
      if (version >= 2 && os2.length >= 90) {
        os2Xh = em(dv.getInt16(os2.offset + 86));
        os2Cap = em(dv.getInt16(os2.offset + 88));
      }
    }
    const post = t.get(TAG("post"));
    const fixedPitch = !!post && dv.getUint32(post.offset + 12) !== 0;

    const cap = top("H") ?? (os2Cap || 700);
    const xh = top("x") ?? (os2Xh || Math.round(cap * 0.72));
    const asc = Math.max(cap, top("d") ?? cap);
    return {
      cap,
      xh,
      asc,
      advances,
      kind: kindOf(fixedPitch, panose),
      weight,
      restricted,
    };
  } catch {
    return null;
  }
}

function glyphTopReader(
  dv: DataView,
  t: Map<number, { offset: number; length: number }>,
  headOffset: number,
): (gid: number) => number | null {
  const loca = t.get(TAG("loca"));
  const glyf = t.get(TAG("glyf"));
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
