export const SFNT_HEADER_SIZE = 12;
export const TABLE_RECORD_SIZE = 16;
const HEAD_CHECKSUM_ADJUSTMENT = 8;
const CHECKSUM_MAGIC = 0xb1b0afba;

export interface SfntTable {
  offset: number;
  length: number;
}

/** The table records of an sfnt font by tag; null when the directory runs past the data. */
export function readTableDirectory(
  dv: DataView,
): Map<string, SfntTable> | null {
  if (dv.byteLength < SFNT_HEADER_SIZE) return null;
  const count = dv.getUint16(4);
  const tables = new Map<string, SfntTable>();
  for (let i = 0; i < count; i++) {
    const rec = SFNT_HEADER_SIZE + i * TABLE_RECORD_SIZE;
    if (rec + TABLE_RECORD_SIZE > dv.byteLength) return null;
    const tag = String.fromCharCode(
      dv.getUint8(rec),
      dv.getUint8(rec + 1),
      dv.getUint8(rec + 2),
      dv.getUint8(rec + 3),
    );
    if (!tables.has(tag))
      tables.set(tag, {
        offset: dv.getUint32(rec + 8),
        length: dv.getUint32(rec + 12),
      });
  }
  return tables;
}

export function pad4(n: number): number {
  return (n + 3) & ~3;
}

export function tableChecksum(bytes: Uint8Array): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  const whole = bytes.length & ~3;
  for (let i = 0; i < whole; i += 4) sum = (sum + dv.getUint32(i)) >>> 0;
  let tail = 0;
  for (let i = whole; i < bytes.length; i++)
    tail |= bytes[i] << (24 - (i - whole) * 8);
  return (sum + (tail >>> 0)) >>> 0;
}

/** Lay `tables` out behind a fresh directory and set head's checkSumAdjustment. */
export function assembleSfnt(
  sfntVersion: number,
  tables: Map<string, Uint8Array>,
): Uint8Array {
  const tags = [...tables.keys()].sort();
  const count = tags.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * TABLE_RECORD_SIZE;
  const directory = SFNT_HEADER_SIZE + count * TABLE_RECORD_SIZE;
  let size = directory;
  for (const tag of tags) size += pad4(tables.get(tag)!.length);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, sfntVersion);
  dv.setUint16(4, count);
  dv.setUint16(6, searchRange);
  dv.setUint16(8, entrySelector);
  dv.setUint16(10, count * TABLE_RECORD_SIZE - searchRange);
  let at = directory;
  let headAt = -1;
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!;
    const rec = SFNT_HEADER_SIZE + i * TABLE_RECORD_SIZE;
    for (let k = 0; k < 4; k++) out[rec + k] = tag.charCodeAt(k);
    out.set(data, at);
    if (tag === "head") {
      headAt = at;
      dv.setUint32(at + HEAD_CHECKSUM_ADJUSTMENT, 0);
    }
    dv.setUint32(rec + 4, tableChecksum(out.subarray(at, at + data.length)));
    dv.setUint32(rec + 8, at);
    dv.setUint32(rec + 12, data.length);
    at += pad4(data.length);
  });
  if (headAt >= 0)
    dv.setUint32(
      headAt + HEAD_CHECKSUM_ADJUSTMENT,
      (CHECKSUM_MAGIC - tableChecksum(out)) >>> 0,
    );
  return out;
}
