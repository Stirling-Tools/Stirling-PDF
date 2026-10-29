import { describe, expect, it } from "vitest";
import {
  fromLatin1,
  toLatin1,
  undoPngPredictor,
} from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  RawPdf,
  arrayItems,
  removeDictEntry,
  setDictEntry,
  spliceValue,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  buildClassicPdf,
  buildXrefStreamPdf,
  singleContentPdf,
  splitContentPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

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

describe("RawPdf.encrypted", () => {
  it.each([
    ["by reference", "/Encrypt 9 0 R"],
    ["written directly", "/Encrypt << /Filter /Standard /V 1 /R 2 >>"],
  ])("sees an /Encrypt dictionary %s", async (_, entry) => {
    const plain = toLatin1(singleContentPdf());
    const bytes = fromLatin1(
      plain.replace("trailer\n<<", `trailer\n<< ${entry}`),
    );
    expect((await RawPdf.parse(bytes))?.encrypted).toBe(true);
    expect((await RawPdf.parse(singleContentPdf()))?.encrypted).toBe(false);
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

  it("does not take a name value for the key it spells", async () => {
    const pdf = await RawPdf.parse(singleContentPdf());
    const body = "<< /Type /StructElem /S /P /P 9 0 R >>";
    expect(pdf?.dictName(body, "S")).toBe("P");
    expect(pdf?.dictRef(body, "P")).toBe(9);
    expect(setDictEntry(body, "P", "10 0 R")).toBe(
      "<< /Type /StructElem /S /P /P 10 0 R >>",
    );
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

const CATALOG = { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" };
const PAGES = { num: 2, body: "<< /Type /Pages /Kids [] /Count 0 >>" };

async function treePdf(...objects: { num: number; body: string }[]) {
  const pdf = await RawPdf.parse(
    buildClassicPdf([CATALOG, PAGES, ...objects], 1),
  );
  if (!pdf) throw new Error("fixture did not parse");
  return pdf;
}

describe("RawPdf.numberTreeEntry", () => {
  it("finds a value in a tree written directly in its holder", async () => {
    const pdf = await treePdf({
      num: 5,
      body: "<< /Type /StructTreeRoot /ParentTree << /Nums [0 [8 0 R] 1 9 0 R] >> >>",
    });
    const entry = pdf.numberTreeEntry(5, "ParentTree", 1);
    expect(entry?.objNum).toBe(5);
    expect(entry?.span.text).toBe("9 0 R");
    const body = pdf.objectBody(5)!;
    expect(body.slice(entry!.span.start, entry!.span.end)).toBe("9 0 R");
  });

  it("follows a referenced tree through /Kids, skipping kids whose /Limits exclude the key", async () => {
    const pdf = await treePdf(
      { num: 5, body: "<< /Type /StructTreeRoot /ParentTree 6 0 R >>" },
      { num: 6, body: "<< /Kids [7 0 R 8 0 R] >>" },
      // Holds a decoy for key 3 outside its own limits, so a search that
      // ignored /Limits would stop here.
      { num: 7, body: "<< /Limits [0 1] /Nums [0 [10 0 R] 3 (decoy)] >>" },
      {
        num: 8,
        body: "<< /Limits [2 4] /Nums [2 [11 0 R] 3 [12 0 R 13 0 R]] >>",
      },
    );
    const entry = pdf.numberTreeEntry(5, "ParentTree", 3);
    expect(entry?.objNum).toBe(8);
    expect(entry?.span.text).toBe("[12 0 R 13 0 R]");
  });

  it("searches kids that have no /Limits", async () => {
    const pdf = await treePdf(
      { num: 5, body: "<< /ParentTree << /Kids [6 0 R] >> >>" },
      { num: 6, body: "<< /Nums [4 [9 0 R]] >>" },
    );
    expect(pdf.numberTreeEntry(5, "ParentTree", 4)?.objNum).toBe(6);
  });

  it("does not read a key out of a value's position", async () => {
    // 9 appears in the array, but only as part of a value.
    const pdf = await treePdf({
      num: 5,
      body: "<< /ParentTree << /Nums [0 [9 0 R] 1 9] >> >>",
    });
    expect(pdf.numberTreeEntry(5, "ParentTree", 9)).toBeNull();
  });

  it("returns null rather than hanging on a cyclic tree", async () => {
    const pdf = await treePdf(
      { num: 5, body: "<< /ParentTree 6 0 R >>" },
      { num: 6, body: "<< /Kids [7 0 R] >>" },
      { num: 7, body: "<< /Kids [6 0 R] >>" },
    );
    expect(pdf.numberTreeEntry(5, "ParentTree", 0)).toBeNull();
  });

  it("honours /Limits and /Kids written as references", async () => {
    const pdf = await treePdf(
      { num: 5, body: "<< /ParentTree 6 0 R >>" },
      { num: 6, body: "<< /Kids 20 0 R >>" },
      { num: 20, body: "[7 0 R 8 0 R]" },
      { num: 7, body: "<< /Limits 21 0 R /Nums [0 [10 0 R] 3 (decoy)] >>" },
      { num: 21, body: "[0 1]" },
      { num: 8, body: "<< /Limits 22 0 R /Nums [3 [12 0 R]] >>" },
      { num: 22, body: "[2 4]" },
    );
    expect(pdf.numberTreeEntry(5, "ParentTree", 3)?.span.text).toBe("[12 0 R]");
  });

  it("searches a tree wider than a few dozen nodes", async () => {
    const leaves = Array.from({ length: 100 }, (_, i) => ({
      num: 100 + i,
      body: `<< /Nums [${i} [${i + 1000} 0 R]] >>`,
    }));
    const kids = leaves.map((l) => `${l.num} 0 R`).join(" ");
    const pdf = await treePdf(
      { num: 5, body: "<< /ParentTree 6 0 R >>" },
      { num: 6, body: `<< /Kids [${kids}] >>` },
      ...leaves,
    );
    expect(pdf.numberTreeEntry(5, "ParentTree", 99)?.span.text).toBe(
      "[1099 0 R]",
    );
  });

  it("returns null when the holder has no such tree", async () => {
    const pdf = await treePdf({ num: 5, body: "<< /Type /StructTreeRoot >>" });
    expect(pdf.numberTreeEntry(5, "ParentTree", 0)).toBeNull();
  });

  it("gives a span a replacement can be spliced into", async () => {
    const pdf = await treePdf(
      { num: 5, body: "<< /ParentTree 6 0 R >>" },
      { num: 6, body: "<< /Nums [0 [8 0 R] 1 [9 0 R]] >>" },
    );
    const entry = pdf.numberTreeEntry(5, "ParentTree", 1)!;
    const body = pdf.objectBody(entry.objNum)!;
    expect(spliceValue(body, entry.span, "[9 0 R 14 0 R]")).toContain(
      "/Nums [0 [8 0 R] 1 [9 0 R 14 0 R]]",
    );
  });
});

describe("setDictEntry", () => {
  it("replaces an existing value", () => {
    expect(setDictEntry("<< /S /Figure /Alt (old) >>", "Alt", "(new)")).toBe(
      "<< /S /Figure /Alt (new) >>",
    );
  });

  it("adds a missing entry to the outermost dictionary, not a nested one", () => {
    const out = setDictEntry("<< /A << /B 1 >> >>", "Alt", "(x)");
    expect(out).toBe("<< /A << /B 1 >>  /Alt (x) >>");
  });

  it("is not fooled by a matching key inside a nested dictionary", () => {
    const out = setDictEntry("<< /A << /Alt (inner) >> >>", "Alt", "(outer)");
    expect(out).toContain("/A << /Alt (inner) >>");
    expect(out).toContain("/Alt (outer) >>");
  });

  it("keeps the result lexable when the value abuts its key", () => {
    expect(setDictEntry("<< /K[1 2] >>", "K", "3")).toBe("<< /K 3 >>");
  });

  it("returns null for a body with no dictionary", () => {
    expect(setDictEntry("[1 2 3]", "K", "4")).toBeNull();
    expect(setDictEntry("<< /K 1", "Alt", "(x)")).toBeNull();
  });
});

describe("removeDictEntry", () => {
  it("removes the key and its value from the outermost dictionary only", () => {
    const out = removeDictEntry(
      "<< /A << /Alt (inner) >> /Alt (outer) /S /Figure >>",
      "Alt",
    );
    expect(out).toBe("<< /A << /Alt (inner) >>  /S /Figure >>");
  });

  it("leaves a body without the key unchanged", () => {
    expect(removeDictEntry("<< /S /P >>", "Alt")).toBe("<< /S /P >>");
  });
});

describe("arrayItems", () => {
  it("reads an indirect reference as one element", () => {
    expect(arrayItems("[8 0 R 9 0 R 3]")?.map((i) => i.text)).toEqual([
      "8 0 R",
      "9 0 R",
      "3",
    ]);
  });

  it("keeps nested arrays, dictionaries and strings whole", () => {
    expect(
      arrayItems("[[1 2] << /Type /MCR /MCID 0 >> (a ] b) <FEFF> /N]")?.map(
        (i) => i.text,
      ),
    ).toEqual(["[1 2]", "<< /Type /MCR /MCID 0 >>", "(a ] b)", "<FEFF>", "/N"]);
  });

  it("skips comments", () => {
    expect(arrayItems("[1 % one ]\n2]")?.map((i) => i.text)).toEqual([
      "1",
      "2",
    ]);
  });

  it("gives spans into the text it was handed", () => {
    const text = "[ 8 0 R  (x) ]";
    for (const item of arrayItems(text)!) {
      expect(text.slice(item.start, item.end)).toBe(item.text);
    }
  });

  it("returns null for anything it cannot read", () => {
    expect(arrayItems("<< /K 1 >>")).toBeNull();
    expect(arrayItems("[1 2")).toBeNull();
    expect(arrayItems("[1 ) 2]")).toBeNull();
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
