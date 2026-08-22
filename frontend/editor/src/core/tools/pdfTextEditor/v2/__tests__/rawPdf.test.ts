import { describe, expect, it } from "vitest";
import {
  fromLatin1,
  toLatin1,
  undoPngPredictor,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";
import { RawPdf } from "@app/tools/pdfTextEditor/v2/pdfdoc/raw";
import {
  buildClassicPdf,
  buildXrefStreamPdf,
  singleContentPdf,
  splitContentPdf,
  streamBody,
} from "@app/tools/pdfTextEditor/v2/__tests__/pdfFixtures";

describe("RawPdf.parse", () => {
  it("indexes objects and resolves the catalogue of a classic-xref file", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    expect(pdf).not.toBeNull();
    expect(pdf?.rootNum).toBe(1);
    expect(pdf?.usesXrefStream).toBe(false);
    expect(pdf?.objectBody(1)).toContain("/Type /Catalog");
  });

  it("finds the catalogue of a cross-reference-stream file, which has no trailer keyword", async () => {
    const bytes = buildXrefStreamPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        { num: 3, body: "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>" },
        { num: 4, body: streamBody("", "q Q") },
      ],
      1,
    );
    expect(toLatin1(bytes)).not.toContain("trailer");
    const pdf = await RawPdf.parse(bytes);
    expect(pdf?.rootNum).toBe(1);
    expect(pdf?.usesXrefStream).toBe(true);
  });

  it("returns null for bytes that are not a PDF", async () => {
    expect(await RawPdf.parse(fromLatin1("not a pdf at all"))).toBeNull();
  });

  it("takes the last definition of an object, so an appended revision wins", async () => {
    const base = toLatin1(singleContentPdf());
    const updated = fromLatin1(
      `${base}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Marker true >>\nendobj\n`,
    );
    const pdf = await RawPdf.parse(updated);
    expect(pdf?.objectBody(1)).toContain("/Marker true");
  });

  it("does not mistake a longer object number for a shorter one", async () => {
    const pdf = await RawPdf.parse(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [912 0 R] /Count 1 >>" },
          { num: 12, body: "<< /Decoy true >>" },
          { num: 912, body: "<< /Type /Page /Parent 2 0 R >>" },
        ],
        1,
      ),
    );
    expect(pdf?.objectBody(12)).toContain("/Decoy true");
    expect(pdf?.pageNumbers()).toEqual([912]);
  });
});

describe("RawPdf.valueSpan", () => {
  it("reads a value from the outermost dictionary only", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const body =
      "<< /Type /Page /Annots [<< /Contents 99 0 R >>] /Contents 7 0 R >>";
    expect(pdf?.dictRef(body, "Contents")).toBe(7);
  });

  it("is not fooled by a key name appearing inside a string", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const body = "<< /Title (a /Contents 42 0 R decoy) /Contents 8 0 R >>";
    expect(pdf?.dictRef(body, "Contents")).toBe(8);
  });

  it("treats an indirect reference as one value rather than an integer", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const body = "<< /Length 12 0 R >>";
    expect(pdf?.dictInt(body, "Length")).toBeNull();
    expect(pdf?.dictRef(body, "Length")).toBe(12);
  });

  it("reads names and arrays", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const body = "<< /Type /Page /Kids [1 0 R 2 0 R] >>";
    expect(pdf?.dictName(body, "Type")).toBe("Page");
    expect(pdf?.valueSpan(body, "Kids")?.text).toBe("[1 0 R 2 0 R]");
  });
});

describe("RawPdf streams and pages", () => {
  it("reads an uncompressed stream's payload", async () => {
    const pdf = await RawPdf.parse(singleContentPdf("q 1 0 0 1 0 0 cm Q"));
    const data = await pdf?.streamData(4);
    expect(toLatin1(data ?? new Uint8Array())).toBe("q 1 0 0 1 0 0 cm Q");
  });

  it("recovers when /Length is wrong by falling back to the endstream keyword", async () => {
    const bytes = buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        { num: 3, body: "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>" },
        { num: 4, body: "<< /Length 9999 >>\nstream\nHELLO\nendstream" },
      ],
      1,
    );
    const pdf = await RawPdf.parse(bytes);
    expect(toLatin1((await pdf?.streamData(4)) ?? new Uint8Array())).toBe(
      "HELLO",
    );
  });

  it("prefers the ObjStm copy when the newest xref calls the object compressed", async () => {
    // A stale top-level body for the same number must not win.
    const inner = "<< /Type /Page /Parent 2 0 R /Contents 9 0 R >>";
    const first = `3 0 ${inner}`;
    const objStm =
      `<< /Type /ObjStm /N 1 /First ${"3 0 ".length} \n/Length ${first.length} >>` +
      `\nstream\n${first}\nendstream`;
    const bytes = buildXrefStreamPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        { num: 3, body: "<< /Type /Page /Contents 4 0 R /Stale true >>" },
        { num: 8, body: objStm },
      ],
      1,
      new Map([[3, 8]]),
    );
    const pdf = await RawPdf.parse(bytes);
    expect(pdf?.objectBody(3)).toContain("/Contents 9 0 R");
    expect(pdf?.objectBody(3)).not.toContain("/Stale");
  });

  it("reads a direct /Filter name rather than treating it as unreadable", async () => {
    const pdf = await RawPdf.parse(singleContentPdf("BT ET"));
    expect(toLatin1((await pdf?.streamData(4)) ?? new Uint8Array())).toBe(
      "BT ET",
    );
  });

  it("walks the page tree in document order, through intermediate nodes", async () => {
    const pdf = await RawPdf.parse(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 3 >>" },
          {
            num: 3,
            body: "<< /Type /Pages /Parent 2 0 R /Kids [4 0 R 5 0 R] >>",
          },
          { num: 4, body: "<< /Type /Page /Parent 3 0 R >>" },
          { num: 5, body: "<< /Type /Page /Parent 3 0 R >>" },
          { num: 6, body: "<< /Type /Page /Parent 2 0 R >>" },
        ],
        1,
      ),
    );
    expect(pdf?.pageNumbers()).toEqual([4, 5, 6]);
    expect(pdf?.pageNumberAt(1)).toBe(5);
    expect(pdf?.pageNumberAt(9)).toBeNull();
  });

  it("survives a cyclic page tree instead of hanging", async () => {
    const pdf = await RawPdf.parse(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [3 0 R] >>" },
          {
            num: 3,
            body: "<< /Type /Pages /Parent 2 0 R /Kids [2 0 R 4 0 R] >>",
          },
          { num: 4, body: "<< /Type /Page /Parent 3 0 R >>" },
        ],
        1,
      ),
    );
    expect(pdf?.pageNumbers()).toEqual([4]);
  });

  it("inherits /Resources from an ancestor page-tree node", async () => {
    const pdf = await RawPdf.parse(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          {
            num: 2,
            body:
              "<< /Type /Pages /Kids [3 0 R] /Count 1 " +
              "/Resources << /Shading << /Sh0 9 0 R >> >> >>",
          },
          { num: 3, body: "<< /Type /Page /Parent 2 0 R >>" },
          { num: 9, body: "<< /ShadingType 2 >>" },
        ],
        1,
      ),
    );
    const resources = pdf?.pageInherited(3, "Resources");
    expect(resources).toContain("/Sh0");
  });

  it("concatenates a multi-part /Contents array in order", async () => {
    const pdf = await RawPdf.parse(
      splitContentPdf(["q 1 0 0", "1 0 0 cm", "Q"]),
    );
    const page = pdf?.pageNumberAt(0) ?? 0;
    const content = toLatin1(
      (await pdf?.pageContent(page)) ?? new Uint8Array(),
    );
    expect(content).toBe("q 1 0 0\n1 0 0 cm\nQ\n");
  });
});

describe("undoPngPredictor", () => {
  it("reverses an Up-filtered image back to its original rows", () => {
    const rowLen = 3;
    // Row 0 is filter 0 (None); row 1 is filter 2 (Up) with deltas.
    const encoded = new Uint8Array([0, 10, 20, 30, 2, 1, 2, 3]);
    const out = undoPngPredictor(encoded, 1, 8, rowLen);
    expect(Array.from(out)).toEqual([10, 20, 30, 11, 22, 33]);
  });

  it("reverses a Sub-filtered row using the left neighbour", () => {
    const encoded = new Uint8Array([1, 5, 5, 5]);
    expect(Array.from(undoPngPredictor(encoded, 1, 8, 3))).toEqual([5, 10, 15]);
  });
});
