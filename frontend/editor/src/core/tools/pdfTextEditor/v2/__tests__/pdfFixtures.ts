// Hand-assembled PDFs for the raw-PDF tests: small enough to reason about
// byte by byte, where a library fixture would hide the structural variation.
import { fromLatin1 } from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";

export interface FixtureObject {
  num: number;
  body: string;
}

/** Build a stream object body with a correct `/Length`. */
export function streamBody(dictInner: string, data: string): string {
  const inner = dictInner.trim();
  const sep = inner.length ? `${inner} ` : "";
  return `<< ${sep}/Length ${data.length} >>\nstream\n${data}\nendstream`;
}

/** Assemble objects into a PDF with a classic cross-reference table. */
export function buildClassicPdf(
  objects: FixtureObject[],
  rootNum: number,
): Uint8Array {
  const sorted = [...objects].sort((a, b) => a.num - b.num);
  let out = "%PDF-1.7\n";
  const offsets = new Map<number, number>();
  for (const obj of sorted) {
    offsets.set(obj.num, out.length);
    out += `${obj.num} 0 obj\n${obj.body}\nendobj\n`;
  }
  const xrefAt = out.length;
  const size = sorted[sorted.length - 1].num + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let num = 1; num < size; num += 1) {
    const off = offsets.get(num);
    out +=
      off === undefined
        ? "0000000000 65535 f \n"
        : `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${size} /Root ${rootNum} 0 R /ID [<AABB> <AABB>] >>\n`;
  out += `startxref\n${xrefAt}\n%%EOF`;
  return fromLatin1(out);
}

/** Assemble objects into a PDF whose newest xref section is a stream. */
export function buildXrefStreamPdf(
  objects: FixtureObject[],
  rootNum: number,
  /** objNum -> containing ObjStm number, emitted as a type-2 xref row. */
  compressed?: Map<number, number>,
): Uint8Array {
  const sorted = [...objects].sort((a, b) => a.num - b.num);
  let out = "%PDF-1.7\n";
  const offsets = new Map<number, number>();
  for (const obj of sorted) {
    offsets.set(obj.num, out.length);
    out += `${obj.num} 0 obj\n${obj.body}\nendobj\n`;
  }
  const xrefNum = sorted[sorted.length - 1].num + 1;
  const size = xrefNum + 1;
  const xrefAt = out.length;
  offsets.set(xrefNum, xrefAt);
  let rows = "";
  for (let num = 0; num < size; num += 1) {
    const container = compressed?.get(num);
    if (container !== undefined) {
      // Type 2: field 2 is the container number, field 3 the index within it.
      rows += String.fromCharCode(
        2,
        (container >>> 24) & 0xff,
        (container >>> 16) & 0xff,
        (container >>> 8) & 0xff,
        container & 0xff,
        0,
        0,
      );
      continue;
    }
    const off = offsets.get(num) ?? 0;
    const type = num === 0 ? 0 : offsets.has(num) ? 1 : 0;
    rows += String.fromCharCode(
      type,
      (off >>> 24) & 0xff,
      (off >>> 16) & 0xff,
      (off >>> 8) & 0xff,
      off & 0xff,
      0,
      num === 0 ? 0xff : 0,
    );
  }
  const dict =
    `<< /Type /XRef /W [1 4 2] /Size ${size} /Root ${rootNum} 0 R ` +
    `/ID [<AABB> <AABB>] /Length ${rows.length} >>`;
  out += `${xrefNum} 0 obj\n${dict}\nstream\n${rows}\nendstream\nendobj\n`;
  out += `startxref\n${xrefAt}\n%%EOF`;
  return fromLatin1(out);
}

/** A one-page document whose `/Contents` is a single stream. */
export function singleContentPdf(
  content = "BT /F1 12 Tf (hi) Tj ET",
): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
          "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      },
      { num: 4, body: streamBody("", content) },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

// One page whose `/Contents` is an array; `tight` omits the separator, the
// shape a naive splice fuses into one token.
export function splitContentPdf(parts: string[], tight = false): Uint8Array {
  const refs = parts.map((_, i) => `${4 + i} 0 R`).join(" ");
  const objects: FixtureObject[] = [
    { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      num: 3,
      body:
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        `/Resources << >> /Contents${tight ? "" : " "}[${refs}] >>`,
    },
  ];
  parts.forEach((p, i) =>
    objects.push({ num: 4 + i, body: streamBody("", p) }),
  );
  return buildClassicPdf(objects, 1);
}
