// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  AnnotationEditError,
  applyAnnotationEdits,
  type AnnotationEdit,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyAnnotationEdits";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import {
  buildClassicPdf,
  streamBody,
  type FixtureObject,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// One page: a paragraph (10) holding MCID 0 and a Link (11) holding MCID 1,
// over two link annotations (20, 21). Object 22 is a dictionary the page does
// not list as an annotation.
function objects(
  overrides: Record<number, string> = {},
  extra: FixtureObject[] = [],
): FixtureObject[] {
  const base: FixtureObject[] = [
    {
      num: 1,
      body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R >>",
    },
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      num: 3,
      body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /StructParents 0 /Annots [20 0 R 21 0 R] >>",
    },
    {
      num: 5,
      body: streamBody(
        "",
        "/P <</MCID 0>> BDC 0 0 10 10 re f EMC /Link <</MCID 1>> BDC 20 0 10 10 re f EMC",
      ),
    },
    {
      num: 7,
      body: "<< /Type /StructTreeRoot /K 9 0 R /ParentTree << /Nums [0 [10 0 R 11 0 R]] >> /ParentTreeNextKey 1 >>",
    },
    {
      num: 9,
      body: "<< /Type /StructElem /S /Document /P 7 0 R /K [10 0 R] >>",
    },
    {
      num: 10,
      body: "<< /Type /StructElem /S /P /P 9 0 R /Pg 3 0 R /K [0 11 0 R] >>",
    },
    {
      num: 11,
      body: "<< /Type /StructElem /S /Link /P 10 0 R /Pg 3 0 R /K 1 >>",
    },
    {
      num: 20,
      body: "<< /Type /Annot /Subtype /Link /Rect [20 0 30 10] /A << /S /URI /URI (https://example.com) >> >>",
    },
    {
      num: 21,
      body: "<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /A << /S /URI /URI (https://example.org) >> >>",
    },
    { num: 22, body: "<< /Subtype /Link >>" },
  ];
  return [
    ...base.map((o) =>
      o.num in overrides ? { ...o, body: overrides[o.num] } : o,
    ),
    ...extra,
  ];
}

const LINK_TO_ELEMENT: AnnotationEdit = {
  pageIndex: 0,
  annotation: 20,
  mcid: 1,
};

// Annotation 20 already held by the Link through ParentTree key 1.
const HELD = {
  7: "<< /Type /StructTreeRoot /K 9 0 R /ParentTree << /Nums [0 [10 0 R 11 0 R] 1 11 0 R] >> /ParentTreeNextKey 2 >>",
  11: "<< /Type /StructElem /S /Link /P 10 0 R /Pg 3 0 R /K [1 << /Type /OBJR /Obj 20 0 R >>] >>",
  20: "<< /Type /Annot /Subtype /Link /Rect [20 0 30 10] /StructParent 1 >>",
};

async function apply(
  edits: AnnotationEdit[],
  fixture = objects(),
): Promise<RawPdf> {
  return (await RawPdf.parse(
    await applyAnnotationEdits(buildClassicPdf(fixture, 1), edits),
  ))!;
}

async function failure(
  edits: AnnotationEdit[],
  fixture = objects(),
): Promise<string[]> {
  const err = await applyAnnotationEdits(
    buildClassicPdf(fixture, 1),
    edits,
  ).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AnnotationEditError);
  return (err as AnnotationEditError).failures.map((f) => f.reason);
}

function entry(pdf: RawPdf, key: number): string | undefined {
  return pdf.numberTreeEntry(7, "ParentTree", key)?.span.text;
}

describe("applyAnnotationEdits", () => {
  test("hands back the bytes untouched when there is nothing to write", async () => {
    const bytes = buildClassicPdf(objects(), 1);
    expect(await applyAnnotationEdits(bytes, [])).toBe(bytes);
  });

  test("gives the element an OBJR and the annotation a ParentTree key naming the element", async () => {
    const pdf = await apply([LINK_TO_ELEMENT]);

    expect(pdf.valueSpan(pdf.objectBody(11)!, "K")!.text).toBe(
      "[1 << /Type /OBJR /Obj 20 0 R /Pg 3 0 R >>]",
    );
    expect(pdf.dictInt(pdf.objectBody(20)!, "StructParent")).toBe(1);
    expect(entry(pdf, 1)).toBe("11 0 R");
    expect(entry(pdf, 0)).toBe("[10 0 R 11 0 R]");
    expect(pdf.dictInt(pdf.objectBody(7)!, "ParentTreeNextKey")).toBe(2);
    expect(pdf.dictName(pdf.objectBody(3)!, "Tabs")).toBe("S");
  });

  test("gives each annotation an element holds a key of its own", async () => {
    const pdf = await apply([
      LINK_TO_ELEMENT,
      { pageIndex: 0, annotation: 21, mcid: 0 },
    ]);
    expect(pdf.dictInt(pdf.objectBody(21)!, "StructParent")).toBe(2);
    expect(entry(pdf, 2)).toBe("10 0 R");
    expect(pdf.dictInt(pdf.objectBody(7)!, "ParentTreeNextKey")).toBe(3);
  });

  test("keeps the element readable, its marked content with it", async () => {
    const bytes = await applyAnnotationEdits(buildClassicPdf(objects(), 1), [
      LINK_TO_ELEMENT,
    ]);
    const structure = await readFileStructure(bytes);
    expect(
      structure!.pages.get(0)!.elements.map(({ mcids, type }) => [mcids, type]),
    ).toEqual([
      [[0], "P"],
      [[1], "Link"],
    ]);
  });

  test("sets, replaces and removes /Contents", async () => {
    const contents = (pdf: RawPdf) => {
      const span = pdf.valueSpan(pdf.objectBody(20)!, "Contents");
      return span && decodeTextString(span.text);
    };
    const set = await apply([
      { pageIndex: 0, annotation: 20, contents: "Old" },
      { pageIndex: 0, annotation: 20, contents: "Café menu" },
    ]);
    expect(contents(set)).toBe("Café menu");
    expect(set.dictInt(set.objectBody(20)!, "StructParent")).toBeNull();

    const removed = await apply(
      [{ pageIndex: 0, annotation: 20, contents: null }],
      objects({ 20: "<< /Type /Annot /Subtype /Link /Contents (Old) >>" }),
    );
    expect(contents(removed)).toBeNull();
  });

  test("changes nothing for an annotation its element already holds", async () => {
    const pdf = await apply(
      [{ ...LINK_TO_ELEMENT, contents: "Example" }],
      objects(HELD),
    );
    expect(pdf.valueSpan(pdf.objectBody(11)!, "K")!.text).toBe(
      "[1 << /Type /OBJR /Obj 20 0 R >>]",
    );
    expect(pdf.dictInt(pdf.objectBody(20)!, "StructParent")).toBe(1);
    expect(pdf.dictInt(pdf.objectBody(7)!, "ParentTreeNextKey")).toBe(2);
  });

  test("adds a leaf to a ParentTree with kids", async () => {
    const pdf = await apply(
      [LINK_TO_ELEMENT],
      objects(
        {
          7: "<< /Type /StructTreeRoot /K 9 0 R /ParentTree 30 0 R /ParentTreeNextKey 1 >>",
        },
        [
          { num: 30, body: "<< /Kids [31 0 R] >>" },
          { num: 31, body: "<< /Limits [0 0] /Nums [0 [10 0 R 11 0 R]] >>" },
        ],
      ),
    );
    expect(entry(pdf, 1)).toBe("11 0 R");
    expect(pdf.objectBody(30)).toMatch(/\/Kids \[31 0 R \d+ 0 R\]/);
  });

  test("reads /Annots held by reference", async () => {
    const pdf = await apply(
      [LINK_TO_ELEMENT],
      objects(
        {
          3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /StructParents 0 /Annots 23 0 R >>",
        },
        [{ num: 23, body: "[20 0 R 21 0 R]" }],
      ),
    );
    expect(entry(pdf, 1)).toBe("11 0 R");
  });

  test("names every edit it cannot write, and writes none of them", async () => {
    expect(
      await failure([
        LINK_TO_ELEMENT,
        { pageIndex: 0, annotation: 22, contents: "x" },
        { pageIndex: 0, annotation: 21, mcid: 5 },
        { pageIndex: 3, annotation: 21, contents: "x" },
      ]),
    ).toEqual([
      "the page's /Annots does not reference it",
      "no structure element owns this MCID",
      "no such page",
    ]);
  });

  test("refuses an annotation another element holds", async () => {
    expect(
      await failure([{ pageIndex: 0, annotation: 20, mcid: 0 }], objects(HELD)),
    ).toEqual(["another element holds it"]);
    expect(
      await failure([
        LINK_TO_ELEMENT,
        { pageIndex: 0, annotation: 20, mcid: 0 },
      ]),
    ).toEqual(["another element holds it"]);
  });

  test("refuses to give an annotation to an element in a file with no structure tree", async () => {
    expect(
      await failure(
        [LINK_TO_ELEMENT],
        objects({ 1: "<< /Type /Catalog /Pages 2 0 R >>" }),
      ),
    ).toEqual(["the file has no structure tree"]);
  });
});
