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

  describe("widgets", () => {
    // Widget 24 is its own field; widget 25 is a kid of field 27.
    const WIDGETS: Record<number, string> = {
      3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /StructParents 0 /Annots [20 0 R 24 0 R 25 0 R] >>",
    };
    const widgetObjects = (
      overrides: Record<number, string> = {},
      extra: FixtureObject[] = [],
    ) =>
      objects({ ...WIDGETS, ...overrides }, [
        ...extra,
        {
          num: 24,
          body: "<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /Rect [0 50 50 60] >>",
        },
        {
          num: 25,
          body: "<< /Type /Annot /Subtype /Widget /Parent 27 0 R /Rect [0 70 50 80] >>",
        },
        { num: 27, body: "<< /FT /Btn /T (choice) /Kids [25 0 R] >>" },
      ]);
    const kids = (pdf: RawPdf, num: number) =>
      pdf.valueSpan(pdf.objectBody(num)!, "K")!.text;
    const refs = (array: string) =>
      [...array.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
    const tooltip = (pdf: RawPdf, num: number) => {
      const span = pdf.valueSpan(pdf.objectBody(num)!, "TU");
      return span && decodeTextString(span.text);
    };

    test("gives a widget a new Form holding only it, after the block its content is in", async () => {
      const pdf = await apply(
        [{ pageIndex: 0, annotation: 24, newForm: { after: 1 } }],
        widgetObjects(),
      );

      const [paragraph, form] = refs(kids(pdf, 9));
      expect(paragraph).toBe(10);
      const body = pdf.objectBody(form)!;
      expect(pdf.dictName(body, "S")).toBe("Form");
      expect(pdf.dictRef(body, "P")).toBe(9);
      expect(pdf.dictRef(body, "Pg")).toBe(3);
      expect(kids(pdf, form)).toBe("[<< /Type /OBJR /Obj 24 0 R /Pg 3 0 R >>]");
      expect(pdf.dictInt(pdf.objectBody(24)!, "StructParent")).toBe(1);
      expect(entry(pdf, 1)).toBe(`${form} 0 R`);
      expect(pdf.dictName(pdf.objectBody(3)!, "Tabs")).toBe("S");
    });

    test("reads Forms placed after the same content in the order of their edits", async () => {
      const pdf = await apply(
        [
          { pageIndex: 0, annotation: 24, newForm: { after: 0 } },
          { pageIndex: 0, annotation: 25, newForm: { after: 0 } },
        ],
        widgetObjects(),
      );
      const [, first, second] = refs(kids(pdf, 9));
      expect(kids(pdf, first)).toContain("/Obj 24 0 R");
      expect(kids(pdf, second)).toContain("/Obj 25 0 R");
    });

    test("reads a Form placed after no content before the page's first", async () => {
      const pdf = await apply(
        [{ pageIndex: 0, annotation: 24, newForm: { after: null } }],
        widgetObjects(),
      );
      const [form, paragraph] = refs(kids(pdf, 9));
      expect(paragraph).toBe(10);
      expect(kids(pdf, form)).toContain("/Obj 24 0 R");
    });

    test("adds a Form to a structure root with several kids, keeping it in the ParentTree too", async () => {
      const pdf = await apply(
        [{ pageIndex: 0, annotation: 24, newForm: { after: null } }],
        widgetObjects(
          {
            3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /Annots [24 0 R] >>",
            7: "<< /Type /StructTreeRoot /K [9 0 R 12 0 R] /ParentTree << /Nums [0 [10 0 R 11 0 R]] >> /ParentTreeNextKey 1 >>",
          },
          [
            {
              num: 12,
              body: "<< /Type /StructElem /S /Sect /P 7 0 R /K [] >>",
            },
          ],
        ),
      );
      const [, , form] = refs(kids(pdf, 7));
      expect(kids(pdf, form)).toContain("/Obj 24 0 R");
      expect(pdf.dictRef(pdf.objectBody(form)!, "P")).toBe(7);
      const key = pdf.dictInt(pdf.objectBody(24)!, "StructParent")!;
      expect(entry(pdf, key)).toBe(`${form} 0 R`);
    });

    test("gives a file with no structure tree one to hold the Form", async () => {
      const pdf = await apply(
        [{ pageIndex: 0, annotation: 24, newForm: { after: null } }],
        widgetObjects({
          1: "<< /Type /Catalog /Pages 2 0 R >>",
          3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /Annots [24 0 R] >>",
        }),
      );
      const treeRoot = pdf.dictRef(pdf.objectBody(1)!, "StructTreeRoot")!;
      const [top] = refs(kids(pdf, treeRoot));
      const [form] = refs(kids(pdf, top));
      expect(pdf.dictName(pdf.objectBody(form)!, "S")).toBe("Form");
      const key = pdf.dictInt(pdf.objectBody(24)!, "StructParent")!;
      expect(pdf.numberTreeEntry(treeRoot, "ParentTree", key)?.span.text).toBe(
        `${form} 0 R`,
      );
    });

    test("sets /TU on a widget that is its own field", async () => {
      const pdf = await apply(
        [{ pageIndex: 0, annotation: 24, tooltip: "Full name" }],
        widgetObjects(),
      );
      expect(tooltip(pdf, 24)).toBe("Full name");
    });

    test("sets and removes /TU on the field a widget belongs to", async () => {
      const set = await apply(
        [{ pageIndex: 0, annotation: 25, tooltip: "Delivery option" }],
        widgetObjects(),
      );
      expect(tooltip(set, 27)).toBe("Delivery option");
      expect(tooltip(set, 25)).toBeNull();

      const removed = await apply(
        [{ pageIndex: 0, annotation: 25, tooltip: null }],
        widgetObjects({
          27: "<< /FT /Btn /T (choice) /TU (Old) /Kids [25 0 R] >>",
        }),
      );
      expect(tooltip(removed, 27)).toBeNull();
    });

    test("refuses a Form or /TU for an annotation that is not a widget", async () => {
      expect(
        await failure(
          [
            { pageIndex: 0, annotation: 20, newForm: { after: null } },
            { pageIndex: 0, annotation: 20, tooltip: "x" },
          ],
          widgetObjects(),
        ),
      ).toEqual(["it is not a widget", "it is not a widget"]);
    });

    test("refuses a widget a second element", async () => {
      expect(
        await failure(
          [
            { pageIndex: 0, annotation: 24, newForm: { after: null } },
            { pageIndex: 0, annotation: 24, newForm: { after: 0 } },
            { pageIndex: 0, annotation: 25, mcid: 0, newForm: { after: 0 } },
          ],
          widgetObjects(),
        ),
      ).toEqual([
        "an element already holds it",
        "it cannot be given two elements",
      ]);
    });
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
