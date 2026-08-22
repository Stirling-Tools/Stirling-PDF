import { describe, expect, it } from "vitest";
import { Blob } from "node:buffer";
import { deflateRawSync } from "node:zlib";

import {
  readFieldBundle,
  supportsFieldBundle,
} from "@app/tools/formFill/fieldBundle";

/**
 * Builds ZIPs the way the backend does, using node:buffer's Blob: jsdom's ignores slice() ranges
 * and has no stream(), so it silently cannot exercise an archive reader at all.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface BuildEntry {
  name: string;
  data: Uint8Array;
  deflate: boolean;
  /** Mimics a writer that defers sizes to a trailing data descriptor. */
  dataDescriptor?: boolean;
  extra?: number;
}

function buildZip(entries: BuildEntry[]): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const payload = entry.deflate
      ? new Uint8Array(deflateRawSync(Buffer.from(entry.data)))
      : entry.data;
    const crc = crc32(entry.data);
    const extraLength = entry.extra ?? 0;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, entry.dataDescriptor ? 0x08 : 0, true);
    local.setUint16(8, entry.deflate ? 8 : 0, true);
    // A data-descriptor writer zeroes these in the local header; only the central copy is right.
    local.setUint32(14, entry.dataDescriptor ? 0 : crc, true);
    local.setUint32(18, entry.dataDescriptor ? 0 : payload.length, true);
    local.setUint32(22, entry.dataDescriptor ? 0 : entry.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, extraLength, true);

    const localHeaderOffset = offset;
    const parts = [
      new Uint8Array(local.buffer),
      name,
      new Uint8Array(extraLength),
      payload,
    ];
    for (const part of parts) {
      chunks.push(part);
      offset += part.length;
    }

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(10, entry.deflate ? 8 : 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, payload.length, true);
    cd.setUint32(24, entry.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, localHeaderOffset, true);
    central.push(new Uint8Array(cd.buffer), name);
  }

  const centralStart = offset;
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, centralStart, true);

  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)]);
}

const FIELDS = [
  { name: "signature", type: "text", widgets: [{ pageIndex: 0 }] },
];

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0xff, 0xfe, 0x80,
  0x7f,
]);

function bundle(overrides: Partial<BuildEntry>[] = []): Blob {
  const pdf = PDF_BYTES;
  return buildZip([
    {
      name: "fields.json",
      data: new TextEncoder().encode(JSON.stringify(FIELDS)),
      deflate: true,
      ...overrides[0],
    },
    { name: "document.pdf", data: pdf, deflate: false, ...overrides[1] },
  ]);
}

describe("readFieldBundle", () => {
  it("reports support when DecompressionStream exists", () => {
    expect(supportsFieldBundle()).toBe(
      typeof DecompressionStream === "function",
    );
  });

  it("returns both the pdf and the deflated field list", async () => {
    const result = await readFieldBundle(bundle());

    expect(result).not.toBeNull();
    expect(result!.fields).toEqual(FIELDS);
    expect(await bytesOf(result!.pdf)).toEqual(PDF_BYTES);
    expect(result!.pdf.type).toBe("application/pdf");
  });

  it("survives an extra field in the local header", async () => {
    // Java writes extended-timestamp extras, and their length differs from the central copy.
    const result = await readFieldBundle(bundle([{}, { extra: 9 }]));

    // Byte-exact on purpose: a slice starting early still contains the header, so
    // containment cannot detect a misread offset.
    expect(await bytesOf(result!.pdf)).toEqual(PDF_BYTES);
  });

  it("reads sizes from the central directory when the local header defers them", async () => {
    const result = await readFieldBundle(
      bundle([{ dataDescriptor: true }, {}]),
    );

    expect(result!.fields).toEqual(FIELDS);
  });

  it("returns null for a bare pdf so the caller can fall back", async () => {
    expect(
      await readFieldBundle(new Blob(["%PDF-1.7 not a zip at all"])),
    ).toBeNull();
  });

  it("returns null when the expected entries are absent", async () => {
    const wrong = buildZip([
      {
        name: "other.txt",
        data: new TextEncoder().encode("nope"),
        deflate: false,
      },
    ]);

    expect(await readFieldBundle(wrong)).toBeNull();
  });

  it("returns null when the field list is not an array", async () => {
    const notArray = buildZip([
      {
        name: "fields.json",
        data: new TextEncoder().encode('{"a":1}'),
        deflate: true,
      },
      {
        name: "document.pdf",
        data: new TextEncoder().encode("%PDF-1.7"),
        deflate: false,
      },
    ]);

    expect(await readFieldBundle(notArray)).toBeNull();
  });

  it("keeps the pdf byte-exact through the slice", async () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;
    const zip = buildZip([
      {
        name: "fields.json",
        data: new TextEncoder().encode("[]"),
        deflate: true,
      },
      { name: "document.pdf", data: bytes, deflate: false },
    ]);

    const result = await readFieldBundle(zip);

    expect(new Uint8Array(await result!.pdf.arrayBuffer())).toEqual(bytes);
  });
});
