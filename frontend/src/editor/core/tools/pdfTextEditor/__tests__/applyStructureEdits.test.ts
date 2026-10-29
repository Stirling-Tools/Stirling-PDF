// @vitest-environment node
// jsdom's Blob cannot stream, so the real fixture's object stream would not inflate.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  StructureEditError,
  applyStructureEdits,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  buildClassicPdf,
  buildXrefStreamPdf,
  streamBody,
  type FixtureObject,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const TAGGED_SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);

// Two pages. Page 1: a paragraph (MCID 0) and a figure (MCID 1). Page 2: a
// figure (MCID 0). Element numbers: 10 = P, 11 = figure on page 1, 12 =
// figure on page 2.
function objects(parentTree = "<< /Nums [0 [10 0 R 11 0 R] 1 [12 0 R]] >>") {
  const page = (num: number, content: number, key: number) => ({
    num,
    body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${content} 0 R /StructParents ${key} >>`,
  });
  return [
    {
      num: 1,
      body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R /MarkInfo << /Marked true >> >>",
    },
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>" },
    page(3, 5, 0),
    page(4, 6, 1),
    {
      num: 5,
      body: streamBody(
        "",
        "/P <</MCID 0>> BDC EMC /Figure <</MCID 1>> BDC 0 0 10 10 re f EMC",
      ),
    },
    {
      num: 6,
      body: streamBody("", "/Figure <</MCID 0>> BDC 0 0 10 10 re f EMC"),
    },
    {
      num: 7,
      body: `<< /Type /StructTreeRoot /K 9 0 R /ParentTree ${parentTree} /ParentTreeNextKey 2 >>`,
    },
    {
      num: 9,
      body: "<< /Type /StructElem /S /Document /P 7 0 R /K [10 0 R 11 0 R 12 0 R] >>",
    },
    {
      num: 10,
      body: "<< /Type /StructElem /S /P /P 9 0 R /Pg 3 0 R /K 0 >>",
    },
    {
      num: 11,
      body: "<< /Type /StructElem /S /Figure /P 9 0 R /Pg 3 0 R /K 1 /Alt (Old one) >>",
    },
    {
      num: 12,
      body: "<< /Type /StructElem /S /Figure /P 9 0 R /Pg 4 0 R /K 0 >>",
    },
  ] satisfies FixtureObject[];
}

async function elementBody(bytes: Uint8Array, num: number): Promise<string> {
  const pdf = await RawPdf.parse(bytes);
  return pdf!.objectBody(num)!;
}

async function failuresOf(
  bytes: Uint8Array,
  edits: Parameters<typeof applyStructureEdits>[1],
): Promise<string[]> {
  const error = await applyStructureEdits(bytes, edits).catch((e) => e);
  expect(error).toBeInstanceOf(StructureEditError);
  return (error as StructureEditError).failures.map((f) => f.reason);
}

describe("applyStructureEdits", () => {
  test("hands back the bytes untouched when there is nothing to write", async () => {
    const bytes = buildClassicPdf(objects(), 1);
    expect(await applyStructureEdits(bytes, [])).toBe(bytes);
  });

  test("sets, replaces and removes /Alt on the elements the MCIDs resolve to", async () => {
    const bytes = buildClassicPdf(objects(), 1);
    const out = await applyStructureEdits(bytes, [
      { pageIndex: 0, mcid: 0, alt: "Intro", decorative: false },
      { pageIndex: 0, mcid: 1, alt: null, decorative: false },
      { pageIndex: 1, mcid: 0, alt: "Second figure", decorative: false },
    ]);
    expect(await elementBody(out, 10)).toContain("/Alt (Intro)");
    expect(await elementBody(out, 11)).not.toContain("/Alt");
    expect(await elementBody(out, 12)).toContain("/Alt (Second figure)");
  });

  test("appends a revision and leaves the original bytes in place", async () => {
    const bytes = buildClassicPdf(objects(), 1);
    const out = await applyStructureEdits(bytes, [
      { pageIndex: 1, mcid: 0, alt: "x", decorative: false },
    ]);
    expect(out.subarray(0, bytes.length)).toEqual(bytes);
    // Only the one element changed, so only it is appended.
    const appended = toLatin1(out.subarray(bytes.length));
    expect(appended.match(/\d+ \d+ obj/g)).toEqual(["12 0 obj"]);
  });

  test("lets the later of two edits to one element win", async () => {
    const out = await applyStructureEdits(buildClassicPdf(objects(), 1), [
      { pageIndex: 0, mcid: 1, alt: "first", decorative: false },
      { pageIndex: 0, mcid: 1, alt: "second", decorative: false },
    ]);
    const body = await elementBody(out, 11);
    expect(body).toContain("/Alt (second)");
    expect(body).not.toContain("first");
  });

  test("resolves a ParentTree held by reference, with the page's array by reference", async () => {
    const tree = [
      ...objects("20 0 R"),
      { num: 20, body: "<< /Kids [21 0 R] >>" },
      { num: 21, body: "<< /Limits [0 1] /Nums [0 22 0 R 1 [12 0 R]] >>" },
      { num: 22, body: "[10 0 R 11 0 R]" },
    ];
    const out = await applyStructureEdits(buildClassicPdf(tree, 1), [
      { pageIndex: 0, mcid: 1, alt: "Found", decorative: false },
    ]);
    expect(await elementBody(out, 11)).toContain("/Alt (Found)");
  });

  test("extends a cross-reference-stream file", async () => {
    const bytes = buildXrefStreamPdf(objects(), 1);
    const out = await applyStructureEdits(bytes, [
      { pageIndex: 0, mcid: 1, alt: "Streamed", decorative: false },
    ]);
    expect(await elementBody(out, 11)).toContain("/Alt (Streamed)");
    expect((await RawPdf.parse(out))?.usesXrefStream).toBe(true);
  });

  test("names every edit it cannot write, and writes none of them", async () => {
    const reasons = await failuresOf(buildClassicPdf(objects(), 1), [
      { pageIndex: 0, mcid: 1, alt: "fine on its own", decorative: false },
      { pageIndex: 5, mcid: 0, alt: "x", decorative: false },
      { pageIndex: 0, mcid: 7, alt: "x", decorative: false },
    ]);
    expect(reasons).toEqual([
      "no such page",
      "no structure element owns this MCID",
    ]);
  });

  test("fails for a page with no /StructParents", async () => {
    const untaggedPage = objects().map((o) =>
      o.num === 4 ? { ...o, body: o.body.replace(" /StructParents 1", "") } : o,
    );
    expect(
      await failuresOf(buildClassicPdf(untaggedPage, 1), [
        { pageIndex: 1, mcid: 0, alt: "x", decorative: false },
      ]),
    ).toEqual(["the page has no /StructParents"]);
  });

  test("fails for a file with no structure tree", async () => {
    const untagged = objects().map((o) =>
      o.num === 1 ? { ...o, body: "<< /Type /Catalog /Pages 2 0 R >>" } : o,
    );
    expect(
      await failuresOf(buildClassicPdf(untagged, 1), [
        { pageIndex: 0, mcid: 0, alt: "x", decorative: false },
      ]),
    ).toEqual(["the file has no structure tree"]);
  });

  test("fails for an encrypted file rather than writing plaintext into it", async () => {
    const encrypted = toLatin1(buildClassicPdf(objects(), 1)).replace(
      "/Root 1 0 R",
      "/Root 1 0 R /Encrypt 30 0 R",
    );
    const bytes = Uint8Array.from(encrypted, (c) => c.charCodeAt(0));
    expect(
      await failuresOf(bytes, [
        { pageIndex: 0, mcid: 0, alt: "x", decorative: false },
      ]),
    ).toEqual(["the file is encrypted"]);
  });
});

describe("applyStructureEdits on a real producer's output", () => {
  beforeAll(async () => {
    const wasmPath = createRequire(import.meta.url).resolve(
      "@embedpdf/pdfium/pdfium.wasm",
    );
    const wasmBytes = await readFile(wasmPath);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(wasmBytes, {
            headers: { "Content-Type": "application/wasm" },
          }),
        ),
      ),
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test("PDFium reads the new description from the saved file", async () => {
    const bytes = new Uint8Array(await readFile(TAGGED_SAMPLE));
    const out = await applyStructureEdits(bytes, [
      {
        pageIndex: 0,
        mcid: 2,
        alt: "Revenue by region, \u00e9t\u00e9 2026",
        decorative: false,
      },
    ]);

    const doc = await EditorDocument.open(out);
    try {
      const m = doc.module;
      const tree = m.FPDF_StructTree_GetForPage(doc.page(0).pagePtr);
      const document = m.FPDF_StructTree_GetChildAtIndex(tree, 0);
      const figure = m.FPDF_StructElement_GetChildAtIndex(document, 2);
      const len = m.FPDF_StructElement_GetAltText(figure, 0, 0);
      const buf = m.pdfium.wasmExports.malloc(len);
      m.FPDF_StructElement_GetAltText(figure, buf, len);
      expect(m.pdfium.UTF16ToString(buf)).toBe(
        "Revenue by region, \u00e9t\u00e9 2026",
      );
      m.pdfium.wasmExports.free(buf);
      m.FPDF_StructTree_Close(tree);
    } finally {
      doc.dispose();
    }
  });
});

async function pageContent(bytes: Uint8Array, pageIndex: number) {
  const pdf = (await RawPdf.parse(bytes))!;
  return toLatin1(
    (await pdf.pageContent(pdf.pageNumberAt(pageIndex)!))!,
  ).trim();
}

function parentArray(pdf: RawPdf, key: number): string {
  const tree = pdf.parentTreeArray(7, key)!;
  return `[${tree.items!.map((item) => item.text).join(" ")}]`;
}

/** `objects()` with the bodies in `overrides` swapped in. */
function withBodies(overrides: Record<number, string>, base = objects()) {
  return base.map((o) =>
    o.num in overrides ? { ...o, body: overrides[o.num] } : o,
  );
}

const DECORATE_FIGURE = {
  pageIndex: 0,
  mcid: 1,
  alt: null,
  decorative: true,
} as const;

describe("applyStructureEdits: marking decorative", () => {
  test("retags the figure's content as an artifact and drops the figure", async () => {
    const out = await applyStructureEdits(buildClassicPdf(objects(), 1), [
      DECORATE_FIGURE,
    ]);
    expect(await pageContent(out, 0)).toBe(
      "/P <</MCID 0>> BDC EMC /Artifact BMC 0 0 10 10 re f EMC",
    );
    expect(await pageContent(out, 1)).toBe(
      "/Figure <</MCID 0>> BDC 0 0 10 10 re f EMC",
    );
    const pdf = (await RawPdf.parse(out))!;
    expect(pdf.valueSpan(pdf.objectBody(9)!, "K")!.text).toBe(
      "[10 0 R 12 0 R]",
    );
    expect(parentArray(pdf, 0)).toBe("[10 0 R null]");
  });

  test("retags a figure held in a named property list", async () => {
    const bytes = buildClassicPdf(
      withBodies({
        3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /StructParents 0 /Resources << /Properties << /MC0 << /MCID 1 >> >> >> >>",
        5: streamBody(
          "",
          "/P <</MCID 0>> BDC EMC /Figure /MC0 BDC 0 0 10 10 re f EMC",
        ),
      }),
      1,
    );
    const out = await applyStructureEdits(bytes, [DECORATE_FIGURE]);
    expect(await pageContent(out, 0)).toBe(
      "/P <</MCID 0>> BDC EMC /Artifact BMC 0 0 10 10 re f EMC",
    );
  });

  test("retags every page a figure spans", async () => {
    const bytes = buildClassicPdf(
      withBodies(
        {
          11: "<< /Type /StructElem /S /Figure /P 9 0 R /Pg 3 0 R /K [1 << /Type /MCR /Pg 4 0 R /MCID 0 >>] >>",
          9: "<< /Type /StructElem /S /Document /P 7 0 R /K [10 0 R 11 0 R] >>",
        },
        objects("<< /Nums [0 [10 0 R 11 0 R] 1 [11 0 R]] >>"),
      ),
      1,
    );
    const out = await applyStructureEdits(bytes, [DECORATE_FIGURE]);
    expect(await pageContent(out, 1)).toBe("/Artifact BMC 0 0 10 10 re f EMC");
    const pdf = (await RawPdf.parse(out))!;
    expect(parentArray(pdf, 0)).toBe("[10 0 R null]");
    expect(parentArray(pdf, 1)).toBe("[null]");
  });

  test("writes a description and a decorative mark in one save", async () => {
    const out = await applyStructureEdits(buildClassicPdf(objects(), 1), [
      DECORATE_FIGURE,
      { pageIndex: 1, mcid: 0, alt: "Second", decorative: false },
    ]);
    expect(await elementBody(out, 12)).toContain("/Alt (Second)");
    const pdf = (await RawPdf.parse(out))!;
    expect(pdf.valueSpan(pdf.objectBody(9)!, "K")!.text).toBe(
      "[10 0 R 12 0 R]",
    );
  });

  test("refuses a figure whose page draws content another page also draws", async () => {
    const bytes = buildClassicPdf(
      withBodies({
        4: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /StructParents 1 >>",
      }),
      1,
    );
    expect(await failuresOf(bytes, [DECORATE_FIGURE])).toEqual([
      "its page draws content another page also draws",
    ]);
  });

  test("refuses a figure with a child element", async () => {
    const bytes = buildClassicPdf(
      [
        ...withBodies({
          11: "<< /Type /StructElem /S /Figure /P 9 0 R /Pg 3 0 R /K [1 13 0 R] >>",
        }),
        {
          num: 13,
          body: "<< /Type /StructElem /S /Caption /P 11 0 R /Pg 3 0 R >>",
        },
      ],
      1,
    );
    expect(await failuresOf(bytes, [DECORATE_FIGURE])).toEqual([
      "its content is not all marked content on its pages",
    ]);
  });

  test("drops a top-level figure when the ParentTree is held in the StructTreeRoot", async () => {
    const bytes = buildClassicPdf(
      withBodies({
        7: "<< /Type /StructTreeRoot /K [9 0 R 11 0 R] /ParentTree << /Nums [0 [10 0 R 11 0 R] 1 [12 0 R]] >> /ParentTreeNextKey 2 >>",
        9: "<< /Type /StructElem /S /Document /P 7 0 R /K [10 0 R 12 0 R] >>",
        11: "<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 1 >>",
      }),
      1,
    );
    const out = await applyStructureEdits(bytes, [DECORATE_FIGURE]);
    const root = await elementBody(out, 7);
    expect(root).toContain("/K [9 0 R]");
    expect(root).toContain("/Nums [0 [10 0 R null] 1 [12 0 R]]");
  });
});

describe("applyStructureEdits: adding figures", () => {
  // Page 1 also draws content marked MCID 2 and 3, which no element owns.
  function untaggedContent(parentTree?: string): Uint8Array {
    return buildClassicPdf(
      objects(parentTree).map((obj) =>
        obj.num === 5
          ? {
              num: 5,
              body: streamBody(
                "",
                "/P <</MCID 0>> BDC EMC /Figure <</MCID 1>> BDC 0 0 10 10 re f EMC " +
                  "/Figure <</MCID 2>> BDC 0 0 5 5 re f EMC /Figure <</MCID 3>> BDC 0 0 2 2 re f EMC",
              ),
            }
          : obj,
      ),
      1,
    );
  }
  const figure = (mcid: number, after: number | null, alt = "Logo") => ({
    pageIndex: 0,
    mcid,
    alt,
    decorative: false,
    newFigure: { after },
  });
  const documentKids = async (bytes: Uint8Array) =>
    (await elementBody(bytes, 9)).match(/\/K \[([^\]]*)\]/)![1];

  test("adds a figure after the element owning the content before it", async () => {
    const out = await applyStructureEdits(untaggedContent(), [figure(2, 0)]);
    expect(await documentKids(out)).toBe("10 0 R 13 0 R 11 0 R 12 0 R");
    expect((await elementBody(out, 13)).trim()).toBe(
      "<< /Type /StructElem /S /Figure /P 9 0 R /Pg 3 0 R /K 2 /Alt (Logo) >>",
    );
    expect(await elementBody(out, 7)).toContain(
      "0 [10 0 R 11 0 R 13 0 R] 1 [12 0 R]",
    );
  });

  test("places a figure before the page's first tagged content when nothing precedes it", async () => {
    const out = await applyStructureEdits(untaggedContent(), [
      figure(2, null, null as unknown as string),
    ]);
    expect(await documentKids(out)).toBe("13 0 R 10 0 R 11 0 R 12 0 R");
    expect(await elementBody(out, 13)).not.toContain("/Alt");
  });

  test("places a figure after one added in the same save", async () => {
    const out = await applyStructureEdits(untaggedContent(), [
      figure(2, 1),
      figure(3, 2),
    ]);
    expect(await documentKids(out)).toBe("10 0 R 11 0 R 13 0 R 14 0 R 12 0 R");
  });

  test("files a figure on a page with no tagged content in the document element", async () => {
    const out = await applyStructureEdits(
      untaggedContent("<< /Nums [0 [10 0 R 11 0 R] 1 [null]] >>"),
      [{ ...figure(0, null), pageIndex: 1 }],
    );
    expect(await documentKids(out)).toBe("10 0 R 11 0 R 12 0 R 13 0 R");
  });

  test("files a figure in a StructTreeRoot that also holds the ParentTree", async () => {
    const out = await applyStructureEdits(
      buildClassicPdf(
        [
          ...withBodies(
            {
              7: "<< /Type /StructTreeRoot /K [9 0 R 8 0 R] /ParentTree << /Nums [0 [10 0 R 11 0 R] 1 [null]] >> /ParentTreeNextKey 2 >>",
            },
            objects(),
          ),
          { num: 8, body: "<< /Type /StructElem /S /Sect /P 7 0 R >>" },
        ],
        1,
      ),
      [{ ...figure(0, null), pageIndex: 1 }],
    );
    const root = await elementBody(out, 7);
    expect(root).toContain("/K [9 0 R 8 0 R 13 0 R]");
    expect(root).toContain("/Nums [0 [10 0 R 11 0 R] 1 [13 0 R]]");
  });

  test("adds a figure beside one marked decorative in the same save", async () => {
    const out = await applyStructureEdits(untaggedContent(), [
      figure(2, 1),
      { pageIndex: 0, mcid: 1, alt: null, decorative: true },
    ]);
    expect(await documentKids(out)).toBe("10 0 R 13 0 R 12 0 R");
    expect(await elementBody(out, 7)).toContain(
      "0 [10 0 R null 13 0 R] 1 [12 0 R]",
    );
  });

  test("refuses an MCID the page's content does not carry, or an element owns", async () => {
    expect(
      await failuresOf(untaggedContent(), [figure(7, 0), figure(1, 0)]),
    ).toEqual([
      "the page's content does not carry its MCID",
      "another element owns its MCID",
    ]);
  });
});
