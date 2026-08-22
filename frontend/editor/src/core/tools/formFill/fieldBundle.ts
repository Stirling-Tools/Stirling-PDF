import type { FormField } from "@app/tools/formFill/types";

/**
 * Reads the ZIP that /edit-fields?includeFields=true returns: the edited PDF stored, the field
 * list deflated. Slicing the stored entry hands back a Blob view, so the PDF is never copied.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;

/** ZIP comments are 64KB at most, so the record cannot start further back than this. */
const EOCD_SEARCH_LIMIT = EOCD_MIN_SIZE + 0xffff;

export const FIELDS_ENTRY = "fields.json";
export const DOCUMENT_ENTRY = "document.pdf";

export interface FieldBundle {
  pdf: Blob;
  fields: FormField[];
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * Without it the deflated entry cannot be read, so callers must fall back to a second request.
 */
export function supportsFieldBundle(): boolean {
  return typeof DecompressionStream === "function";
}

/** ZIP local file headers start with "PK\x03\x04". */
async function looksZipped(blob: Blob): Promise<boolean> {
  if (blob.size < EOCD_MIN_SIZE) return false;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return (
    head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
  );
}

/** Scans back from the end for the end-of-central-directory record. */
async function readEocd(
  blob: Blob,
): Promise<{ offset: number; size: number } | null> {
  const tailSize = Math.min(blob.size, EOCD_SEARCH_LIMIT);
  const tail = new DataView(
    await blob.slice(blob.size - tailSize).arrayBuffer(),
  );
  for (let i = tailSize - EOCD_MIN_SIZE; i >= 0; i--) {
    if (tail.getUint32(i, true) !== EOCD_SIGNATURE) continue;
    return {
      size: tail.getUint32(i + 12, true),
      offset: tail.getUint32(i + 16, true),
    };
  }
  return null;
}

function parseCentralDirectory(bytes: ArrayBuffer): CentralEntry[] {
  const view = new DataView(bytes);
  const decoder = new TextDecoder();
  const entries: CentralEntry[] = [];
  let cursor = 0;
  while (cursor + CENTRAL_HEADER_SIZE <= view.byteLength) {
    if (view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) break;
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    entries.push({
      name: decoder.decode(
        new Uint8Array(bytes, cursor + CENTRAL_HEADER_SIZE, nameLength),
      ),
      method: view.getUint16(cursor + 10, true),
      compressedSize: view.getUint32(cursor + 20, true),
      localHeaderOffset: view.getUint32(cursor + 42, true),
    });
    cursor += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * The local header carries its own extra field, whose length can differ from the central copy, so
 * the payload offset has to be read from the local header rather than assumed.
 */
async function dataOffset(blob: Blob, entry: CentralEntry): Promise<number> {
  const header = new DataView(
    await blob
      .slice(
        entry.localHeaderOffset,
        entry.localHeaderOffset + LOCAL_HEADER_SIZE,
      )
      .arrayBuffer(),
  );
  return (
    entry.localHeaderOffset +
    LOCAL_HEADER_SIZE +
    header.getUint16(26, true) +
    header.getUint16(28, true)
  );
}

async function inflateRaw(part: Blob): Promise<ArrayBuffer> {
  const stream = part
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).arrayBuffer();
}

/** A stored entry is returned as a view, so the PDF is never copied. */
async function readEntry(
  blob: Blob,
  entry: CentralEntry,
  type: string,
): Promise<Blob> {
  const start = await dataOffset(blob, entry);
  const part = blob.slice(start, start + entry.compressedSize, type);
  if (entry.method === METHOD_STORED) return part;
  return new Blob([await readEntryBytes(blob, entry)], { type });
}

async function readEntryBytes(
  blob: Blob,
  entry: CentralEntry,
): Promise<ArrayBuffer> {
  const start = await dataOffset(blob, entry);
  const part = blob.slice(start, start + entry.compressedSize);
  if (entry.method === METHOD_STORED) return part.arrayBuffer();
  if (entry.method !== METHOD_DEFLATED) {
    throw new Error(`Unsupported ZIP compression method ${entry.method}`);
  }
  return inflateRaw(part);
}

/**
 * Returns null when the body is not the bundle - an older backend ignoring the flag, say - so the
 * caller can fall back to fetching the fields separately.
 */
export async function readFieldBundle(blob: Blob): Promise<FieldBundle | null> {
  if (!(await looksZipped(blob))) return null;
  const eocd = await readEocd(blob);
  if (!eocd) return null;

  const directory = parseCentralDirectory(
    await blob.slice(eocd.offset, eocd.offset + eocd.size).arrayBuffer(),
  );
  const documentEntry = directory.find(
    (entry) => entry.name === DOCUMENT_ENTRY,
  );
  const fieldsEntry = directory.find((entry) => entry.name === FIELDS_ENTRY);
  if (!documentEntry || !fieldsEntry) return null;

  const [pdf, fields] = await Promise.all([
    readEntry(blob, documentEntry, "application/pdf"),
    readEntryBytes(blob, fieldsEntry),
  ]);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(fields));
  return Array.isArray(parsed) ? { pdf, fields: parsed as FormField[] } : null;
}
