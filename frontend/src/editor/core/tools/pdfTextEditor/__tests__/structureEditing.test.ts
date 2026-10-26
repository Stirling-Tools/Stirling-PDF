// @vitest-environment node
// jsdom's Blob cannot stream, so the real fixture's object stream would not inflate.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { SetAltTextCommand } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import { SetDecorativeCommand } from "@editor/tools/pdfTextEditor/commands/SetDecorativeCommand";
import { TagImageCommand } from "@editor/tools/pdfTextEditor/commands/TagImageCommand";
import { DeleteImageCommand } from "@editor/tools/pdfTextEditor/commands/DeleteImageCommand";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import { readTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PageStructure } from "@editor/tools/pdfTextEditor/model/PageStructure";
import { StructureEditError } from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import { readPageStructure } from "@editor/tools/pdfTextEditor/pdfium/PdfiumStructureReader";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { PdfiumSave } from "@editor/tools/pdfTextEditor/pdfium/PdfiumSave";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  HistoryStack,
  HistoryStepError,
} from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { expectConsole } from "@editor/tests/failOnConsole";
import {
  imageAccessibility,
  imageAttention,
  nextImageNeedingAttention,
  reviewImages,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";
import { InsertImageCommand } from "@editor/tools/pdfTextEditor/commands/InsertImageCommand";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const TAGGED_SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);
const FIGURE_MCID = 2;
const FIGURE_ALT = "Bar chart of revenue by region";

// A described figure (MCID 0) and a decorative rule drawn as an artifact image.
// `ownerType` retypes the element owning MCID 0; `tagged: false` drops the
// catalog's tree, leaving the content's marks behind.
function imagesPdf({
  ownerType = "Figure",
  tagged = true,
}: { ownerType?: string; tagged?: boolean } = {}): Uint8Array {
  return buildClassicPdf(
    [
      {
        num: 1,
        body: tagged
          ? "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> >>"
          : "<< /Type /Catalog /Pages 2 0 R >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /StructParents 0 " +
          "/Resources << /XObject << /Im1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody(
          "",
          "/Figure <</MCID 0>> BDC q 50 0 0 50 10 100 cm /Im1 Do Q EMC\n" +
            "/Artifact BMC q 180 0 0 2 10 20 cm /Im1 Do Q EMC\n",
        ),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\x80",
        ),
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 9 0 R /ParentTreeNextKey 1 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R] >>",
      },
      {
        num: 8,
        body: `<< /Type /StructElem /S /${ownerType} /P 7 0 R /Pg 3 0 R /K 0 /Alt (A grey square) >>`,
      },
      { num: 9, body: "<< /Nums [0 [8 0 R]] >>" },
    ],
    1,
  );
}

const opened: EditorDocument[] = [];

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  return doc;
}

async function openSample(): Promise<EditorDocument> {
  return open(new Uint8Array(await readFile(TAGGED_SAMPLE)));
}

async function savedBytes(doc: EditorDocument): Promise<Uint8Array> {
  const { blob } = await exportToBlob(doc, "sample.pdf");
  return new Uint8Array(await blob.arrayBuffer());
}

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

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("reading the structure tree", () => {
  test("lists each element with its type, description and MCIDs", async () => {
    const doc = await openSample();
    const elements = readPageStructure(doc.module, doc.page(0).pagePtr);
    const element = (type: string, alt: string | null, mcids: number[]) => ({
      type,
      alt,
      actualText: null,
      mcids,
      onlyMarkedContent: false,
    });
    expect(elements).toEqual([
      element("Document", null, []),
      element("H1", null, [0]),
      element("P", null, [1]),
      element("Figure", FIGURE_ALT, [2]),
    ]);
  });

  test("reads an untagged page as having no structure", async () => {
    const doc = await open(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
          {
            num: 3,
            body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>",
          },
        ],
        1,
      ),
    );
    expect(doc.structure(0).tagged).toBe(false);
  });

  test("gives each image its MCID or its artifact marking", async () => {
    const doc = await open(imagesPdf());
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    expect(page.images.map((i) => i.snapshot())).toMatchObject([
      { mcid: 0 },
      { artifact: true },
    ]);
    expect(page.images[1].mcid).toBeNull();
    expect(doc.structure(0).alt(0)).toBe("A grey square");
  });
});

/**
 * Page 0: Figure (element 8, MCID 0) and the start of a paragraph (element 9,
 * MCID 5) that continues on page 1 as MCID 0, so PDFium lists the paragraph
 * as [5, 0] on both pages. `slot0` is what page 0's ParentTree has at MCID 0.
 */
function spanningPdf(slot0 = "8 0 R"): Uint8Array {
  const page0 =
    "/Figure <</MCID 0>> BDC 0 0 10 10 re f EMC /P <</MCID 5>> BDC 0 0 5 5 re f EMC\n";
  const page1 = "/P <</MCID 0>> BDC 0 0 5 5 re f EMC\n";
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>" },
      {
        num: 3,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 20 0 R /StructParents 0 >>",
      },
      {
        num: 4,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 21 0 R /StructParents 1 >>",
      },
      {
        num: 5,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 6 0 R /RoleMap << /Chart /Figure >> >>",
      },
      {
        num: 6,
        body: `<< /Nums [0 [${slot0} null null null null 9 0 R] 1 [9 0 R]] >>`,
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 5 0 R /K [8 0 R 9 0 R] >>",
      },
      {
        num: 8,
        // UTF-16BE for "Chart", under a custom role the RoleMap makes a Figure.
        body: "<< /Type /StructElem /S /Chart /P 7 0 R /Pg 3 0 R /K 0 /Alt <FEFF00430068006100720074> >>",
      },
      {
        num: 9,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K [5 << /Type /MCR /Pg 4 0 R /MCID 0 >>] >>",
      },
      { num: 20, body: streamBody("", page0) },
      { num: 21, body: streamBody("", page1) },
    ],
    1,
  );
}

describe("reading tags from the file's ParentTree", () => {
  test("gives each page's MCIDs to the element its ParentTree names", async () => {
    const structure = (await readFileStructure(spanningPdf()))!;
    const element = (type: string, alt: string | null, mcids: number[]) => ({
      type,
      alt,
      actualText: null,
      mcids,
      onlyMarkedContent: true,
    });
    expect(structure.get(0)).toEqual({
      elements: [element("Figure", "Chart", [0]), element("P", null, [5])],
      slotCount: 6,
    });
    expect(structure.get(1)).toEqual({
      elements: [element("P", null, [0])],
      slotCount: 1,
    });
  });

  test("describes the figure, not the paragraph that spans the page break", async () => {
    const doc = await open(spanningPdf());
    expect(doc.structure(0).alt(0)).toBe("Chart");
    new HistoryStack().execute(
      new SetAltTextCommand({ pageIndex: 0, mcid: 0, alt: "Revenue chart" }),
      doc,
    );
    const pdf = (await RawPdf.parse(await savedBytes(doc)))!;
    expect(pdf.objectBody(8)).toContain("/Alt (Revenue chart)");
    expect(pdf.objectBody(9)).not.toContain("/Alt");
  });

  test("refuses an MCID only another page's content carries", async () => {
    const doc = await open(spanningPdf("null"));
    expect(doc.structure(0).cannotDescribe(0)).toBe("untagged");
  });
});

describe("imageAccessibility", () => {
  async function images(doc: EditorDocument) {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    return page.images.map((img) => img.snapshot());
  }

  test("offers the figure's description and follows edits to it", async () => {
    const doc = await open(imagesPdf());
    const [figure] = await images(doc);
    expect(imageAccessibility(doc, figure)).toEqual({
      kind: "describable",
      description: "A grey square",
      tagged: true,
      canBeDecorative: true,
    });
    new HistoryStack().execute(
      new SetAltTextCommand({ pageIndex: 0, mcid: 0, alt: "A dark square" }),
      doc,
    );
    expect(imageAccessibility(doc, figure)).toMatchObject({
      description: "A dark square",
    });
  });

  test("reads an artifact image as decorative, which retagging can undo", async () => {
    const doc = await open(imagesPdf());
    const [, rule] = await images(doc);
    expect(imageAccessibility(doc, rule)).toEqual({
      kind: "decorative",
      canUndecorate: true,
    });
  });

  test("cannot undo an artifact in an untagged document", async () => {
    const doc = await open(imagesPdf({ tagged: false }));
    const [, rule] = await images(doc);
    expect(imageAccessibility(doc, rule)).toEqual({
      kind: "decorative",
      canUndecorate: false,
    });
  });

  test("blocks an image tagged as part of a paragraph", async () => {
    const doc = await open(imagesPdf({ ownerType: "P" }));
    const [image] = await images(doc);
    expect(imageAccessibility(doc, image)).toEqual({
      kind: "blocked",
      blocker: "not-figure",
      documentTagged: true,
    });
  });

  test("blocks every image in an untagged document", async () => {
    const doc = await open(imagesPdf({ tagged: false }));
    const [image] = await images(doc);
    expect(imageAccessibility(doc, image)).toEqual({
      kind: "blocked",
      blocker: "untagged",
      documentTagged: false,
    });
  });
});

/**
 * Two pages of figures, every one an image: A (page 0, MCID 0) and C (page 1,
 * MCID 0) have no description, B (page 0, MCID 1) has one.
 */
function figuresPdf(): Uint8Array {
  const draw = (mcid: number, y: number) =>
    `/Figure <</MCID ${mcid}>> BDC q 20 0 0 20 10 ${y} cm /Im1 Do Q EMC\n`;
  const page = (num: number, contents: number, key: number) => ({
    num,
    body:
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contents} 0 R ` +
      `/StructParents ${key} /Resources << /XObject << /Im1 5 0 R >> >> >>`,
  });
  const figure = (num: number, pageNum: number, mcid: number, alt = "") => ({
    num,
    body: `<< /Type /StructElem /S /Figure /P 7 0 R /Pg ${pageNum} 0 R /K ${mcid}${alt} >>`,
  });
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>" },
      page(3, 20, 0),
      page(4, 21, 1),
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\x80",
        ),
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 9 0 R /ParentTreeNextKey 2 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [10 0 R 11 0 R 12 0 R] >>",
      },
      { num: 9, body: "<< /Nums [0 [10 0 R 11 0 R] 1 [12 0 R]] >>" },
      figure(10, 3, 0),
      figure(11, 3, 1, " /Alt (B)"),
      figure(12, 4, 0),
      { num: 20, body: streamBody("", draw(0, 150) + draw(1, 100)) },
      { num: 21, body: streamBody("", draw(0, 150)) },
    ],
    1,
  );
}

describe("reviewing images that need attention", () => {
  async function pages(doc: EditorDocument): Promise<PageSnapshot[]> {
    return [0, 1].map((pageIndex) => {
      const page = doc.page(pageIndex);
      PdfiumTextReader.populate(doc, page);
      return {
        pageIndex,
        images: page.images.map((img) => img.snapshot()),
      } as PageSnapshot;
    });
  }

  test("counts the undescribed images across pages", async () => {
    const doc = await open(figuresPdf());
    expect(reviewImages(doc, await pages(doc))).toEqual({
      needsDescription: 2,
      untagged: 0,
      untaggable: 0,
    });
  });

  test("walks to the next one in page order, wrapping round", async () => {
    const doc = await open(figuresPdf());
    const read = await pages(doc);
    const [a, b] = read[0].images;
    const [c] = read[1].images;
    const next = (from: string | null) =>
      nextImageNeedingAttention(doc, read, from)?.id;
    expect(next(null)).toBe(a.id);
    expect(next(a.id)).toBe(c.id);
    expect(next(b.id)).toBe(c.id);
    expect(next(c.id)).toBe(a.id);
  });

  test("drops an image once described, but not for a blank description", async () => {
    const doc = await open(figuresPdf());
    const read = await pages(doc);
    const describe = (alt: string) =>
      new HistoryStack().execute(
        new SetAltTextCommand({ pageIndex: 0, mcid: 0, alt }),
        doc,
      );
    describe("   ");
    expect(reviewImages(doc, read).needsDescription).toBe(2);
    describe("A bar chart");
    expect(reviewImages(doc, read).needsDescription).toBe(1);
    const [c] = read[1].images;
    expect(nextImageNeedingAttention(doc, read, c.id)?.id).toBe(c.id);
  });

  test("flags an image inserted into a tagged document as untagged", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    const insert = new InsertImageCommand({
      pageIndex: 0,
      rgba: new Uint8ClampedArray([255, 0, 0, 255]),
      pixelWidth: 1,
      pixelHeight: 1,
      x: 300,
      y: 300,
      width: 40,
      height: 40,
    });
    history.execute(insert, doc);
    const page = doc.page(0);
    const inserted = page.images
      .find((img) => img.id === insert.insertedImageId)!
      .snapshot();
    const read = [
      { pageIndex: 0, images: page.images.map((img) => img.snapshot()) },
    ] as PageSnapshot[];

    expect(imageAttention(doc, inserted)).toBe("untagged");
    expect(reviewImages(doc, read)).toEqual({
      needsDescription: 0,
      untagged: 1,
      untaggable: 0,
    });
    expect(nextImageNeedingAttention(doc, read, null)?.id).toBe(inserted.id);
  });

  test("leaves an untagged document's images out of the review", async () => {
    const doc = await open(imagesPdf({ tagged: false }));
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    const read = [
      { pageIndex: 0, images: page.images.map((img) => img.snapshot()) },
    ] as PageSnapshot[];
    expect(reviewImages(doc, read)).toEqual({
      needsDescription: 0,
      untagged: 0,
      untaggable: 0,
    });
  });
});

/**
 * An image drawn by each of three form XObjects: one the page marks as an
 * artifact, one the page tags as a described Figure (MCID 0), and one whose
 * form tags its own content, which the page's ParentTree cannot resolve.
 */
function formImagesPdf(): Uint8Array {
  const draw = (y: number) => `q 20 0 0 20 10 ${y} cm /Im1 Do Q\n`;
  const form = (num: number, content: string, extra = "") => ({
    num,
    body: streamBody(
      `/Type /XObject /Subtype /Form /BBox [0 0 200 200]${extra} ` +
        "/Resources << /XObject << /Im1 5 0 R >> >>",
      content,
    ),
  });
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /StructParents 0 " +
          "/Resources << /XObject << /Fm1 10 0 R /Fm2 11 0 R /Fm3 12 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody(
          "",
          "/Artifact BMC /Fm1 Do EMC\n/Figure <</MCID 0>> BDC /Fm2 Do EMC\n/Fm3 Do\n",
        ),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\x80",
        ),
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 9 0 R /ParentTreeNextKey 2 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R] >>",
      },
      {
        num: 8,
        body: "<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 0 /Alt (A framed square) >>",
      },
      { num: 9, body: "<< /Nums [0 [8 0 R]] >>" },
      form(10, draw(150)),
      form(11, draw(100)),
      form(12, `/Figure <</MCID 0>> BDC ${draw(50)}EMC\n`, " /StructParents 1"),
    ],
    1,
  );
}

describe("images drawn by a form XObject", () => {
  async function images(doc: EditorDocument) {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    return page.images.map((img) => img.snapshot());
  }

  test("is decorative inside a form the page marks as an artifact", async () => {
    const doc = await open(formImagesPdf());
    const [artifact] = await images(doc);
    expect(artifact).toMatchObject({ inForm: true, artifact: true });
    expect(imageAccessibility(doc, artifact)).toEqual({
      kind: "decorative",
      canUndecorate: false,
    });
    expect(imageAttention(doc, artifact)).toBeNull();
  });

  test("takes the tag the page gives its form", async () => {
    const doc = await open(formImagesPdf());
    const [, figure] = await images(doc);
    expect(figure).toMatchObject({ inForm: true, mcid: 0 });
    expect(imageAccessibility(doc, figure)).toEqual({
      kind: "describable",
      description: "A framed square",
      tagged: true,
      canBeDecorative: true,
    });
  });

  test("is untaggable when its form tags its own content", async () => {
    const doc = await open(formImagesPdf());
    const [, , owned] = await images(doc);
    expect(owned.mcid).toBeUndefined();
    expect(imageAttention(doc, owned)).toBe("untaggable");
  });

  test("counts an untaggable image apart, and Next passes it by", async () => {
    const doc = await open(formImagesPdf());
    const read = [
      { pageIndex: 0, images: await images(doc) },
    ] as PageSnapshot[];
    expect(reviewImages(doc, read)).toEqual({
      needsDescription: 0,
      untagged: 0,
      untaggable: 1,
    });
    expect(nextImageNeedingAttention(doc, read, null)).toBeNull();
  });

  test("saves the page's tag on its form as an artifact when marked decorative", async () => {
    const doc = await open(formImagesPdf());
    const [, figure] = await images(doc);
    new HistoryStack().execute(
      new SetDecorativeCommand({
        pageIndex: 0,
        mcid: figure.mcid!,
        decorative: true,
      }),
      doc,
    );

    const reopened = await open(await savedBytes(doc));
    const [, saved] = await images(reopened);
    expect(imageAccessibility(reopened, saved)).toEqual({
      kind: "decorative",
      canUndecorate: false,
    });
  });
});

describe("PageStructure", () => {
  const figure = {
    type: "Figure",
    alt: "old",
    actualText: null,
    mcids: [3, 4],
    onlyMarkedContent: true,
  };

  test("holds one edit per element, whichever of its MCIDs addressed it", () => {
    const s = new PageStructure([figure]);
    s.setEdit(3, { mcid: 3, alt: "new", decorative: false });
    expect(s.alt(4)).toBe("new");
    s.setEdit(4, { mcid: 4, alt: "newer", decorative: false });
    expect(s.pendingEdits()).toEqual([
      { mcid: 4, alt: "newer", decorative: false },
    ]);
  });

  test("reads back the file's description once an edit is dropped", () => {
    const s = new PageStructure([figure]);
    s.setEdit(3, { mcid: 3, alt: null, decorative: false });
    expect(s.alt(3)).toBeNull();
    s.setEdit(3, null);
    expect(s.alt(3)).toBe("old");
    expect(s.pendingEdits()).toEqual([]);
  });

  test("refuses an edit no element can carry", () => {
    expect(() =>
      new PageStructure([figure]).setEdit(9, {
        mcid: 9,
        alt: "x",
        decorative: false,
      }),
    ).toThrow();
  });

  test("describes figures and formulas but not elements that hold text", () => {
    const s = new PageStructure([
      figure,
      { ...figure, type: "Formula", alt: null, mcids: [5] },
      { ...figure, type: "P", alt: null, mcids: [6] },
    ]);
    expect(s.cannotDescribe(3)).toBeNull();
    expect(s.cannotDescribe(5)).toBeNull();
    expect(s.cannotDescribe(6)).toBe("not-figure");
    expect(s.cannotDescribe(9)).toBe("untagged");
  });

  test("keeps the description when marked decorative, and the mark when described", () => {
    const s = new PageStructure([figure]);
    s.setAlt(3, "new");
    s.setDecorative(4, true);
    expect(s.pendingEdits()).toEqual([
      { mcid: 4, alt: "new", decorative: true },
    ]);
    s.setAlt(3, "newer");
    expect(s.decorative(3)).toBe(true);
    s.setDecorative(3, false);
    expect(s.alt(3)).toBe("newer");
  });

  test("refuses decorative for a figure with content besides marked content", () => {
    expect(
      new PageStructure([
        { ...figure, onlyMarkedContent: false },
      ]).cannotMarkDecorative(3),
    ).toBe("mixed-content");
    expect(new PageStructure([figure]).cannotMarkDecorative(3)).toBeNull();
  });

  test("refuses every description when the save cannot write them", () => {
    expect(new PageStructure([figure], "encrypted").cannotDescribe(3)).toBe(
      "encrypted",
    );
  });
});

describe("SetAltTextCommand", () => {
  test("undoes and redoes a description", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    history.execute(
      new SetAltTextCommand({ pageIndex: 0, mcid: FIGURE_MCID, alt: "New" }),
      doc,
    );
    expect(doc.structure(0).alt(FIGURE_MCID)).toBe("New");
    history.undo(doc);
    expect(doc.structure(0).alt(FIGURE_MCID)).toBe(FIGURE_ALT);
    expect(doc.structureEdits()).toEqual([]);
    history.redo(doc);
    expect(doc.structureEdits()).toEqual([
      { pageIndex: 0, mcid: FIGURE_MCID, alt: "New", decorative: false },
    ]);
  });

  test("collapses typing into one undo step that restores the original", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    for (const alt of ["B", "Ba", "Bar"]) {
      history.execute(
        new SetAltTextCommand({ pageIndex: 0, mcid: FIGURE_MCID, alt }),
        doc,
      );
    }
    expect(history.size().undo).toBe(1);
    history.undo(doc);
    expect(doc.structure(0).alt(FIGURE_MCID)).toBe(FIGURE_ALT);
  });

  test.each([
    ["content no element owns", 42],
    // The sample's paragraph: an /Alt there would replace its text.
    ["a paragraph", 1],
  ])("rolls back cleanly for %s", async (_, mcid) => {
    const doc = await openSample();
    const error = (() => {
      try {
        new HistoryStack().execute(
          new SetAltTextCommand({ pageIndex: 0, mcid, alt: "x" }),
          doc,
        );
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(HistoryStepError);
    expect((error as HistoryStepError).documentIntact).toBe(true);
    expect(doc.structureEdits()).toEqual([]);
  });

  test("refuses a description in an encrypted file, which the save could not write", async () => {
    const plain = await openSample();
    expect(plain.module.EPDF_SetEncryption(plain.docPtr, "", "owner", -4)).toBe(
      true,
    );
    const doc = await open(PdfiumSave.serialize(plain));
    expect(() =>
      new HistoryStack().execute(
        new SetAltTextCommand({ pageIndex: 0, mcid: FIGURE_MCID, alt: "x" }),
        doc,
      ),
    ).toThrow(HistoryStepError);
    expect(doc.structureEdits()).toEqual([]);
  });
});

describe("SetDecorativeCommand", () => {
  test("marks and unmarks a figure, undoably", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    history.execute(
      new SetDecorativeCommand({
        pageIndex: 0,
        mcid: FIGURE_MCID,
        decorative: true,
      }),
      doc,
    );
    expect(doc.structure(0).decorative(FIGURE_MCID)).toBe(true);
    history.undo(doc);
    expect(doc.structure(0).decorative(FIGURE_MCID)).toBe(false);
    expect(doc.structureEdits()).toEqual([]);
    history.redo(doc);
    expect(doc.structureEdits()).toEqual([
      { pageIndex: 0, mcid: FIGURE_MCID, alt: FIGURE_ALT, decorative: true },
    ]);
  });

  test("refuses a paragraph", async () => {
    const doc = await openSample();
    expect(() =>
      new HistoryStack().execute(
        new SetDecorativeCommand({ pageIndex: 0, mcid: 1, decorative: true }),
        doc,
      ),
    ).toThrow(HistoryStepError);
    expect(doc.structureEdits()).toEqual([]);
  });

  test("saves the figure as an artifact, touching nothing it paints", async () => {
    const original = new Uint8Array(await readFile(TAGGED_SAMPLE));
    const doc = await open(original);
    new HistoryStack().execute(
      new SetDecorativeCommand({
        pageIndex: 0,
        mcid: FIGURE_MCID,
        decorative: true,
      }),
      doc,
    );
    const saved = await savedBytes(doc);

    const content = async (bytes: Uint8Array) => {
      const pdf = (await RawPdf.parse(bytes))!;
      return toLatin1((await pdf.pageContent(pdf.pageNumberAt(0)!))!);
    };
    expect(await content(saved)).toBe(
      (await content(original)).replace(
        `/Figure <</MCID ${FIGURE_MCID}>> BDC`,
        "/Artifact BMC",
      ),
    );

    const reopened = await open(saved);
    const page = reopened.page(0);
    PdfiumTextReader.populate(reopened, page);
    const [image] = page.images.map((img) => img.snapshot());
    expect(imageAccessibility(reopened, image)).toEqual({
      kind: "decorative",
      canUndecorate: true,
    });
    expect(reopened.structure(0).elements.map((e) => e.type)).not.toContain(
      "Figure",
    );
    expect(
      reviewImages(reopened, [
        { pageIndex: 0, images: [image] },
      ] as PageSnapshot[]),
    ).toEqual({ needsDescription: 0, untagged: 0, untaggable: 0 });
  });
});

describe("saving a description", () => {
  test("appends it to the opened file when nothing else changed", async () => {
    const doc = await openSample();
    new SetAltTextCommand({
      pageIndex: 0,
      mcid: FIGURE_MCID,
      alt: "Revenue, by region",
    }).apply(doc);

    const saved = await savedBytes(doc);
    // An appended revision, not a PDFium rewrite of the whole file.
    expect(saved.subarray(0, doc.openedBytes.length)).toEqual(doc.openedBytes);
    const reopened = await open(saved);
    expect(reopened.structure(0).alt(FIGURE_MCID)).toBe("Revenue, by region");
  });

  test("keeps it alongside regenerated page content", async () => {
    const doc = await openSample();
    new SetAltTextCommand({
      pageIndex: 0,
      mcid: FIGURE_MCID,
      alt: null,
    }).apply(doc);
    doc.page(0).markNeedsGenerate();

    const reopened = await open(await savedBytes(doc));
    expect(reopened.structure(0).alt(FIGURE_MCID)).toBeNull();
    expect(reopened.structure(0).element(FIGURE_MCID)?.type).toBe("Figure");
  });

  test("leaves a save with no edits byte-identical", async () => {
    const doc = await openSample();
    doc.structure(0);
    expect(await savedBytes(doc)).toEqual(doc.openedBytes);
  });

  test("fails the save rather than dropping an edit it cannot write", async () => {
    const doc = await openSample();
    vi.spyOn(doc, "structureEdits").mockReturnValue([
      { pageIndex: 0, mcid: 42, alt: "x", decorative: false },
    ]);
    // The detail is logged for a bug report; the user gets a message they can act on.
    expectConsole.error(/Could not write 1 tag edit/);
    const error = await exportToBlob(doc, "sample.pdf").catch((e) => e);
    expect(error.message).toBe(
      "Your accessibility changes couldn't be saved, so the file wasn't saved. Undo them and try again.",
    );
    expect(error.cause).toBeInstanceOf(StructureEditError);
  });
});

describe("PageStructure: added figures", () => {
  const paragraph = {
    type: "P",
    alt: null,
    actualText: null,
    mcids: [3],
    onlyMarkedContent: true,
  };

  test("takes an MCID above every slot, added figure and marked content", () => {
    const s = new PageStructure([paragraph], null, 5);
    expect(s.freeMcid(2)).toBe(5);
    expect(s.freeMcid(7)).toBe(8);
    s.addFigure(5);
    expect(s.freeMcid(2)).toBe(6);
  });

  test("lists added figures apart from edits to the file's elements", () => {
    const s = new PageStructure([{ ...paragraph, type: "Figure" }], null, 5);
    s.addFigure(5);
    s.setAlt(5, "Logo");
    s.setAlt(3, "Chart");
    expect(s.pendingEdits()).toEqual([
      { mcid: 3, alt: "Chart", decorative: false },
    ]);
    expect(s.addedFigures()).toEqual([{ mcid: 5, alt: "Logo" }]);
    expect(() => s.setDecorative(5, true)).toThrow();
    s.removeFigure(5);
    expect(s.addedFigures()).toEqual([]);
    expect(s.element(5)).toBeNull();
  });

  test("adds none where the page has no ParentTree array or is read-only", () => {
    expect(
      new PageStructure([paragraph], null, 5).cannotAddFigure(),
    ).toBeNull();
    expect(new PageStructure([]).cannotAddFigure()).toBe("untagged");
    expect(new PageStructure([], "encrypted", 5).cannotAddFigure()).toBe(
      "encrypted",
    );
  });
});

async function readPage(doc: EditorDocument) {
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  return page;
}

/** Insert a 20pt square image at (10, y) on page 0. */
function insertImage(
  doc: EditorDocument,
  history: HistoryStack,
  y: number,
): ImageObject {
  const insert = new InsertImageCommand({
    pageIndex: 0,
    rgba: new Uint8ClampedArray([255, 0, 0, 255]),
    pixelWidth: 1,
    pixelHeight: 1,
    x: 10,
    y,
    width: 20,
    height: 20,
  });
  history.execute(insert, doc);
  return doc.page(0).findImage(insert.insertedImageId!)!;
}

const tagImage = (
  image: ImageObject,
  as: "figure" | "artifact",
  alt?: string,
) => new TagImageCommand({ pageIndex: 0, imageId: image.id, as, alt });

const describable = (description: string | null) => ({
  kind: "describable",
  description,
  tagged: true,
  canBeDecorative: true,
});

describe("TagImageCommand", () => {
  const marks = (doc: EditorDocument, image: ImageObject) =>
    readTagMarks(doc.module, image.pdfiumObjPtr);

  test("describes an inserted image as a new figure, undoably", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    history.execute(tagImage(image, "figure", "A logo"), doc);
    expect(marks(doc, image)).toEqual([{ name: "Figure", mcid: 1 }]);
    expect(imageAccessibility(doc, image.snapshot())).toEqual(
      describable("A logo"),
    );

    history.undo(doc);
    expect(marks(doc, image)).toEqual([]);
    expect(imageAttention(doc, image.snapshot())).toBe("untagged");
    expect(doc.structureEdits()).toEqual([]);

    history.redo(doc);
    expect(image.mcid).toBe(1);
    expect(doc.structure(0).alt(1)).toBe("A logo");
  });

  test("undoes the typing that follows in the same step", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    history.execute(tagImage(image, "figure", "A"), doc);
    history.execute(
      new SetAltTextCommand({ pageIndex: 0, mcid: 1, alt: "A logo" }),
      doc,
    );
    history.undo(doc);
    expect(image.mcid).toBeNull();
    expect(doc.structure(0).addedFigures()).toEqual([]);
  });

  test("un-decorates an artifact, restoring the mark on undo", async () => {
    const doc = await open(imagesPdf());
    const [, rule] = (await readPage(doc)).images;
    const history = new HistoryStack();
    history.execute(tagImage(rule, "figure"), doc);
    expect(marks(doc, rule)).toEqual([{ name: "Figure", mcid: 1 }]);
    expect(imageAccessibility(doc, rule.snapshot())).toEqual(describable(null));

    history.undo(doc);
    expect(marks(doc, rule)).toEqual([{ name: "Artifact", mcid: null }]);
    expect(imageAccessibility(doc, rule.snapshot())).toEqual({
      kind: "decorative",
      canUndecorate: true,
    });
  });

  test("marks an added figure decorative, dropping it and its description", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    history.execute(tagImage(image, "figure", "A logo"), doc);
    history.execute(tagImage(image, "artifact"), doc);
    expect(marks(doc, image)).toEqual([{ name: "Artifact", mcid: null }]);
    expect(doc.structure(0).addedFigures()).toEqual([]);

    history.undo(doc);
    expect(doc.structure(0).addedFigures()).toEqual([
      { mcid: 1, alt: "A logo" },
    ]);
  });

  test("refuses content the file's elements own", async () => {
    const doc = await open(imagesPdf());
    const [figure] = (await readPage(doc)).images;
    expect(() =>
      new HistoryStack().execute(tagImage(figure, "artifact"), doc),
    ).toThrow(HistoryStepError);
    expect(marks(doc, figure)).toEqual([{ name: "Figure", mcid: 0 }]);
  });

  test("refuses an image in an untagged document", async () => {
    const doc = await open(imagesPdf({ tagged: false }));
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    expect(() =>
      history.execute(tagImage(image, "figure", "A logo"), doc),
    ).toThrow(HistoryStepError);
    expect(marks(doc, image)).toEqual([]);
  });
});

describe("saving an added figure", () => {
  async function reopen(bytes: Uint8Array) {
    const doc = await open(bytes);
    const page = await readPage(doc);
    return { doc, images: page.images.map((img) => img.snapshot()) };
  }

  /** The page's elements in tree order, each as its description or else its type. */
  const tree = (doc: EditorDocument) =>
    readPageStructure(doc.module, doc.page(0).pagePtr).map(
      (el) => el.alt ?? el.type,
    );

  test("puts an inserted image's figure after the content above it, every save", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    history.execute(tagImage(image, "figure", "A logo"), doc);

    await savedBytes(doc);
    const { doc: reopened, images } = await reopen(await savedBytes(doc));
    const added = images.find((img) => img.mcid === 1)!;
    expect(imageAccessibility(reopened, added)).toEqual(describable("A logo"));
    expect(tree(reopened)).toEqual(["Document", "A grey square", "A logo"]);
  });

  test("puts a figure above all the page's tagged content first", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 170);
    history.execute(tagImage(image, "figure", "A logo"), doc);

    const { doc: reopened } = await reopen(await savedBytes(doc));
    expect(tree(reopened)).toEqual(["Document", "A logo", "A grey square"]);
  });

  test("saves an un-decorated artifact as a described figure", async () => {
    const doc = await open(imagesPdf());
    const [, rule] = (await readPage(doc)).images;
    const history = new HistoryStack();
    history.execute(tagImage(rule, "figure"), doc);
    history.execute(
      new SetAltTextCommand({ pageIndex: 0, mcid: 1, alt: "A divider" }),
      doc,
    );

    const { doc: reopened, images } = await reopen(await savedBytes(doc));
    expect(images.map((img) => imageAccessibility(reopened, img))).toEqual([
      describable("A grey square"),
      describable("A divider"),
    ]);
    expect(tree(reopened)).toEqual(["Document", "A grey square", "A divider"]);
  });

  test("saves an untagged image marked decorative as an artifact", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    history.execute(tagImage(image, "artifact"), doc);

    const { doc: reopened, images } = await reopen(await savedBytes(doc));
    expect(images.filter((img) => img.artifact)).toHaveLength(2);
    expect(
      reviewImages(reopened, [{ pageIndex: 0, images }] as PageSnapshot[]),
    ).toEqual({ needsDescription: 0, untagged: 0, untaggable: 0 });
    expect(tree(reopened)).toEqual(["Document", "A grey square"]);
  });

  test("leaves out the figure of an image deleted after it was described", async () => {
    const doc = await open(imagesPdf());
    await readPage(doc);
    const history = new HistoryStack();
    const image = insertImage(doc, history, 60);
    history.execute(tagImage(image, "figure", "A logo"), doc);
    history.execute(
      new DeleteImageCommand({ pageIndex: 0, imageId: image.id }),
      doc,
    );
    expect(doc.structureEdits()).toEqual([]);

    const { doc: reopened } = await reopen(await savedBytes(doc));
    expect(tree(reopened)).toEqual(["Document", "A grey square"]);
  });
});
