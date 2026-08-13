/**
 * Append an incremental revision to a PDF.
 *
 * Everything the raw-PDF passes do is expressed as "add these objects,
 * shadow those ones" and appended to the end of the file. That is the only
 * edit shape that leaves the original bytes untouched, which matters twice
 * over: existing digital signatures keep verifying against their own
 * revision, and a pass that turns out to be wrong can never destroy content
 * that was already there.
 */
import {
  concatBytes,
  fromLatin1,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";
import type { RawPdf } from "@app/tools/pdfTextEditor/v2/pdfdoc/raw";

export interface RevisionObject {
  num: number;
  /** Complete object body, everything that goes between `obj` and `endobj`. */
  body: Uint8Array;
}

/** Build the body of a stream object from its dictionary and payload. */
export function streamObject(
  dictWithoutLength: string,
  data: Uint8Array,
): Uint8Array {
  const trimmed = dictWithoutLength.trim();
  const inner = trimmed.replace(/^<<|>>$/g, "").trim();
  const head = `<< ${inner} /Length ${data.length} >>\nstream\n`;
  return concatBytes([fromLatin1(head), data, fromLatin1("\nendstream")]);
}

export function plainObject(body: string): Uint8Array {
  return fromLatin1(body);
}

/**
 * Serialise `objects` as a new revision appended to `pdf`.
 *
 * Returns null when the file's structure is not one this can extend safely -
 * the caller then keeps the original bytes, which is always a valid outcome.
 */
export function appendRevision(
  pdf: RawPdf,
  objects: RevisionObject[],
): Uint8Array | null {
  if (objects.length === 0) return pdf.bytes;
  if (pdf.startXref < 0) return null;

  const sorted = [...objects].sort((a, b) => a.num - b.num);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].num === sorted[i - 1].num) return null;
  }

  const parts: Uint8Array[] = [pdf.bytes];
  let at = pdf.bytes.length;
  // PDFium and most producers end the file with `%%EOF` and no trailing
  // newline; starting the revision on its own line keeps the appended
  // objects lexable regardless.
  const lead = fromLatin1("\n");
  parts.push(lead);
  at += lead.length;

  const offsets = new Map<number, number>();
  for (const obj of sorted) {
    const header = fromLatin1(`${obj.num} 0 obj\n`);
    offsets.set(obj.num, at);
    parts.push(header, obj.body, fromLatin1("\nendobj\n"));
    at += header.length + obj.body.length + "\nendobj\n".length;
  }

  // Above everything in the batch, not just above the file: callers allocate
  // their new objects from the same high-water mark, so basing this on that
  // mark alone hands the xref stream a number a content stream already has -
  // and the page then resolves its content to the cross-reference stream.
  const xrefStreamNum = pdf.usesXrefStream
    ? Math.max(pdf.highestObjectNumber, sorted[sorted.length - 1].num) + 1
    : -1;
  const size = Math.max(
    pdf.highestObjectNumber + 1,
    sorted[sorted.length - 1].num + 1,
    xrefStreamNum >= 0 ? xrefStreamNum + 1 : 0,
  );
  const idPart = pdf.trailerId ? ` /ID ${pdf.trailerId}` : "";

  if (xrefStreamNum < 0) {
    const xrefAt = at;
    let table = "xref\n";
    for (const [first, nums] of runsOf(sorted.map((o) => o.num))) {
      table += `${first} ${nums.length}\n`;
      for (const num of nums) {
        table += `${String(offsets.get(num) ?? 0).padStart(10, "0")} 00000 n \n`;
      }
    }
    table +=
      `trailer\n<< /Size ${size} /Root ${pdf.rootNum} 0 R ` +
      `/Prev ${pdf.startXref}${idPart} >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`;
    parts.push(fromLatin1(table));
    return concatBytes(parts);
  }

  // Cross-reference-stream file: the update must be a stream too. A classic
  // table whose /Prev points at a stream is not a structure readers accept.
  offsets.set(xrefStreamNum, at);
  const entryNums = [...sorted.map((o) => o.num), xrefStreamNum].sort(
    (a, b) => a - b,
  );
  const groups = [...runsOf(entryNums)];
  const index: number[] = [];
  const rows: number[][] = [];
  for (const [first, nums] of groups) {
    index.push(first, nums.length);
    for (const num of nums) {
      const off = offsets.get(num) ?? 0;
      rows.push([1, off, 0]);
    }
  }
  const data = new Uint8Array(rows.length * 7);
  rows.forEach((row, i) => {
    const base = i * 7;
    data[base] = row[0];
    data[base + 1] = (row[1] >>> 24) & 0xff;
    data[base + 2] = (row[1] >>> 16) & 0xff;
    data[base + 3] = (row[1] >>> 8) & 0xff;
    data[base + 4] = row[1] & 0xff;
    data[base + 5] = (row[2] >>> 8) & 0xff;
    data[base + 6] = row[2] & 0xff;
  });
  const dict =
    `<< /Type /XRef /W [1 4 2] /Index [${index.join(" ")}] ` +
    `/Size ${size} /Root ${pdf.rootNum} 0 R /Prev ${pdf.startXref}${idPart} >>`;
  const xrefBody = streamObject(dict, data);
  const header = fromLatin1(`${xrefStreamNum} 0 obj\n`);
  parts.push(header, xrefBody, fromLatin1("\nendobj\n"));
  parts.push(fromLatin1(`startxref\n${at}\n%%EOF\n`));
  return concatBytes(parts);
}

/** Group sorted object numbers into consecutive runs for xref subsections. */
function* runsOf(nums: number[]): Generator<[number, number[]]> {
  let run: number[] = [];
  for (const num of nums) {
    if (run.length === 0 || num === run[run.length - 1] + 1) {
      run.push(num);
      continue;
    }
    yield [run[0], run];
    run = [num];
  }
  if (run.length > 0) yield [run[0], run];
}
