const TTCF = 0x74746366;
const NAME = 0x6e616d65;

function isCollection(dv: DataView): boolean {
  return dv.byteLength >= 12 && dv.getUint32(0) === TTCF;
}

function faceOffsets(dv: DataView): number[] {
  const count = dv.getUint32(8);
  const offsets: number[] = [];
  for (let i = 0; i < count && 12 + i * 4 + 4 <= dv.byteLength; i++)
    offsets.push(dv.getUint32(12 + i * 4));
  return offsets;
}

function tableRecords(
  dv: DataView,
  sfnt: number,
): Array<{ tag: number; checksum: number; offset: number; length: number }> {
  const count = dv.getUint16(sfnt + 4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const rec = sfnt + 12 + i * 16;
    if (rec + 16 > dv.byteLength) break;
    out.push({
      tag: dv.getUint32(rec),
      checksum: dv.getUint32(rec + 4),
      offset: dv.getUint32(rec + 8),
      length: dv.getUint32(rec + 12),
    });
  }
  return out;
}

function readPostscriptName(dv: DataView, sfnt: number): string | null {
  const name = tableRecords(dv, sfnt).find((t) => t.tag === NAME);
  if (!name || name.offset + 6 > dv.byteLength) return null;
  const count = dv.getUint16(name.offset + 2);
  const strings = name.offset + dv.getUint16(name.offset + 4);
  for (let i = 0; i < count; i++) {
    const rec = name.offset + 6 + i * 12;
    if (rec + 12 > dv.byteLength) break;
    if (dv.getUint16(rec + 6) !== 6) continue;
    const platform = dv.getUint16(rec);
    const length = dv.getUint16(rec + 8);
    const start = strings + dv.getUint16(rec + 10);
    if (start + length > dv.byteLength) continue;
    let text = "";
    if (platform === 3 || platform === 0)
      for (let k = 0; k + 1 < length; k += 2)
        text += String.fromCharCode(dv.getUint16(start + k));
    else
      for (let k = 0; k < length; k++)
        text += String.fromCharCode(dv.getUint8(start + k));
    if (text) return text;
  }
  return null;
}

function standalone(dv: DataView, bytes: Uint8Array, sfnt: number): Uint8Array {
  const records = tableRecords(dv, sfnt).filter(
    (t) => t.offset + t.length <= bytes.length,
  );
  const header = 12 + records.length * 16;
  const padded = (n: number) => (n + 3) & ~3;
  const size = records.reduce((s, t) => s + padded(t.length), header);
  const out = new Uint8Array(size);
  const ov = new DataView(out.buffer);
  out.set(bytes.subarray(sfnt, sfnt + 12), 0);
  ov.setUint16(4, records.length);
  let at = header;
  records.forEach((t, i) => {
    const rec = 12 + i * 16;
    ov.setUint32(rec, t.tag);
    ov.setUint32(rec + 4, t.checksum);
    ov.setUint32(rec + 8, at);
    ov.setUint32(rec + 12, t.length);
    out.set(bytes.subarray(t.offset, t.offset + t.length), at);
    at += padded(t.length);
  });
  return out;
}

export function fontFace(
  bytes: Uint8Array,
  postscriptName?: string,
): Uint8Array | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!isCollection(dv)) return bytes;
  try {
    const offsets = faceOffsets(dv);
    const wanted = postscriptName?.trim();
    const pick = wanted
      ? offsets.find((o) => readPostscriptName(dv, o) === wanted)
      : offsets[0];
    return pick === undefined ? null : standalone(dv, bytes, pick);
  } catch {
    return null;
  }
}

export function facePostscriptNames(bytes: Uint8Array): string[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const offsets = isCollection(dv) ? faceOffsets(dv) : [0];
    return offsets.map((o) => readPostscriptName(dv, o) ?? "");
  } catch {
    return [];
  }
}
