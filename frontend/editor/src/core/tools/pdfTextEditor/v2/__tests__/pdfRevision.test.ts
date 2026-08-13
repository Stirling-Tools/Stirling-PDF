import { describe, expect, it } from "vitest";
import { fromLatin1, toLatin1 } from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";
import { RawPdf } from "@app/tools/pdfTextEditor/v2/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  streamObject,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/revision";
import {
  buildXrefStreamPdf,
  singleContentPdf,
  streamBody,
} from "@app/tools/pdfTextEditor/v2/__tests__/pdfFixtures";

/** The property that makes an incremental revision safe for signed files. */
function prefixIsIntact(before: Uint8Array, after: Uint8Array): boolean {
  if (after.length < before.length) return false;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) return false;
  }
  return true;
}

describe("appendRevision", () => {
  it("leaves every original byte in place", async () => {
    const original = singleContentPdf();
    const pdf = await RawPdf.parse(original);
    expect(pdf).not.toBeNull();
    const out = appendRevision(pdf as RawPdf, [
      { num: 6, body: plainObject("<< /Added true >>") },
    ]);
    expect(out).not.toBeNull();
    expect(prefixIsIntact(original, out as Uint8Array)).toBe(true);
  });

  it("makes the appended object readable and shadows an existing one", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const out = appendRevision(pdf as RawPdf, [
      { num: 1, body: plainObject("<< /Type /Catalog /Pages 2 0 R /V 2 >>") },
      { num: 6, body: plainObject("<< /Added true >>") },
    ]);
    const reparsed = await RawPdf.parse(out as Uint8Array);
    expect(reparsed?.objectBody(6)).toContain("/Added true");
    expect(reparsed?.objectBody(1)).toContain("/V 2");
    expect(reparsed?.rootNum).toBe(1);
  });

  it("writes a classic table whose /Prev points at the previous section", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const text = toLatin1(
      appendRevision(pdf as RawPdf, [
        { num: 6, body: plainObject("<< >>") },
      ]) as Uint8Array,
    );
    expect(text).toContain("trailer");
    expect(text).toMatch(/\/Prev \d+/);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("writes a cross-reference STREAM when the source file uses one", async () => {
    const original = buildXrefStreamPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        { num: 3, body: "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>" },
        { num: 4, body: streamBody("", "q Q") },
      ],
      1,
    );
    const pdf = await RawPdf.parse(original);
    const out = appendRevision(pdf as RawPdf, [
      {
        num: 3,
        body: plainObject("<< /Type /Page /Parent 2 0 R /Rotate 90 >>"),
      },
    ]) as Uint8Array;
    const tail = toLatin1(out).slice(original.length);
    // A classic table here would be a structure readers reject.
    expect(tail).not.toContain("\ntrailer");
    expect(tail).toContain("/Type /XRef");
    expect(prefixIsIntact(original, out)).toBe(true);
    const reparsed = await RawPdf.parse(out);
    expect(reparsed?.objectBody(3)).toContain("/Rotate 90");
  });

  it("never gives the xref stream a number the batch already uses", async () => {
    const original = buildXrefStreamPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        { num: 3, body: "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>" },
        { num: 4, body: streamBody("", "q Q") },
      ],
      1,
    );
    const pdf = await RawPdf.parse(original);
    // Callers allocate from the same high-water mark this used to use, so the
    // first new object and the xref stream collided.
    const newNum = (pdf as RawPdf).highestObjectNumber + 1;
    const out = appendRevision(pdf as RawPdf, [
      { num: newNum, body: streamObject("<< >>", fromLatin1("q Q")) },
      {
        num: 3,
        body: plainObject(
          `<< /Type /Page /Parent 2 0 R /Contents ${newNum} 0 R >>`,
        ),
      },
    ]) as Uint8Array;

    const text = toLatin1(out);
    expect(
      text.match(new RegExp(`(^|[^0-9])${newNum} 0 obj`, "g")),
    ).toHaveLength(1);
    const reparsed = await RawPdf.parse(out);
    expect(reparsed?.objectBody(newNum)).not.toContain("/Type /XRef");
    expect(
      toLatin1((await reparsed?.streamData(newNum)) ?? new Uint8Array()),
    ).toBe("q Q");
  });

  it("round-trips a stream object it wrote", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const payload = fromLatin1("0 0 1 rg 10 10 50 50 re f");
    const out = appendRevision(pdf as RawPdf, [
      { num: 7, body: streamObject("<< >>", payload) },
    ]) as Uint8Array;
    const reparsed = await RawPdf.parse(out);
    const back = await reparsed?.streamData(7);
    expect(toLatin1(back ?? new Uint8Array())).toBe(
      "0 0 1 rg 10 10 50 50 re f",
    );
  });

  it("refuses a batch that writes the same object twice", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    expect(
      appendRevision(pdf as RawPdf, [
        { num: 6, body: plainObject("<< /A 1 >>") },
        { num: 6, body: plainObject("<< /A 2 >>") },
      ]),
    ).toBeNull();
  });

  it("returns the input unchanged when there is nothing to write", async () => {
    const original = singleContentPdf();
    const pdf = await RawPdf.parse(original);
    expect(appendRevision(pdf as RawPdf, [])).toBe(original);
  });
});
