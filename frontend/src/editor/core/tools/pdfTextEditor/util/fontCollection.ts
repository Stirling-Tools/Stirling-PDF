import {
  assembleSfnt,
  readTableDirectory,
  type SfntTable,
} from "@editor/tools/pdfTextEditor/util/sfnt";

const TTCF = 0x74746366;
const FS_TYPE_OFFSET = 8;
const FS_TYPE_USAGE_MASK = 0x000f;
const FS_TYPE_RESTRICTED = 0x0002;
const FS_TYPE_BITMAP_ONLY = 0x0200;

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

function tablesAt(dv: DataView, sfnt: number): Map<string, SfntTable> {
  const face = new DataView(
    dv.buffer,
    dv.byteOffset + sfnt,
    dv.byteLength - sfnt,
  );
  return readTableDirectory(face) ?? new Map();
}

function readPostscriptName(dv: DataView, sfnt: number): string | null {
  const name = tablesAt(dv, sfnt).get("name");
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
  const tables = new Map<string, Uint8Array>();
  for (const [tag, t] of tablesAt(dv, sfnt))
    if (t.offset + t.length <= bytes.length)
      tables.set(tag, bytes.subarray(t.offset, t.offset + t.length));
  return assembleSfnt(dv.getUint32(sfnt), tables);
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

/**
 * Whether a single face's licence forbids embedding its outlines in a
 * document, per the OS/2 `fsType` field: Restricted Licence, or bitmap-only.
 * Must stay in sync with `EditorFontReader` on the server. A face with no
 * readable OS/2 table declares no restriction. Takes one face, not a
 * collection.
 */
export function embeddingForbidden(bytes: Uint8Array): boolean {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    const os2 = tablesAt(dv, 0).get("OS/2");
    if (!os2 || os2.offset + FS_TYPE_OFFSET + 2 > dv.byteLength) return false;
    const fsType = dv.getUint16(os2.offset + FS_TYPE_OFFSET);
    return (
      (fsType & FS_TYPE_USAGE_MASK) === FS_TYPE_RESTRICTED ||
      (fsType & FS_TYPE_BITMAP_ONLY) !== 0
    );
  } catch {
    return false;
  }
}
