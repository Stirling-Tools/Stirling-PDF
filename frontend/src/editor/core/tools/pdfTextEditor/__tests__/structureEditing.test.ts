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
function imagesPdf(): Uint8Array {
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
        body: "<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 0 /Alt (A grey square) >>",
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
    expect(elements).toEqual([
      { type: "Document", alt: null, actualText: null, mcids: [] },
      { type: "H1", alt: null, actualText: null, mcids: [0] },
      { type: "P", alt: null, actualText: null, mcids: [1] },
      { type: "Figure", alt: FIGURE_ALT, actualText: null, mcids: [2] },
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
    expect(structure.get(0)).toEqual([
      { type: "Figure", alt: "Chart", actualText: null, mcids: [0] },
      { type: "P", alt: null, actualText: null, mcids: [5] },
    ]);
    expect(structure.get(1)).toEqual([
      { type: "P", alt: null, actualText: null, mcids: [0] },
    ]);
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
    expect(doc.structure(0).cannotDescribe(0)).toMatch(/no structure element/);
  });
});

describe("PageStructure", () => {
  const figure = {
    type: "Figure",
    alt: "old",
    actualText: null,
    mcids: [3, 4],
  };

  test("holds one edit per element, whichever of its MCIDs addressed it", () => {
    const s = new PageStructure([figure]);
    s.setEdit(3, { mcid: 3, alt: "new" });
    expect(s.alt(4)).toBe("new");
    s.setEdit(4, { mcid: 4, alt: "newer" });
    expect(s.pendingEdits()).toEqual([{ mcid: 4, alt: "newer" }]);
  });

  test("reads back the file's description once an edit is dropped", () => {
    const s = new PageStructure([figure]);
    s.setEdit(3, { mcid: 3, alt: null });
    expect(s.alt(3)).toBeNull();
    s.setEdit(3, null);
    expect(s.alt(3)).toBe("old");
    expect(s.pendingEdits()).toEqual([]);
  });

  test("refuses an edit no element can carry", () => {
    expect(() =>
      new PageStructure([figure]).setEdit(9, { mcid: 9, alt: "x" }),
    ).toThrow();
  });

  test("describes figures and formulas but not elements that hold text", () => {
    const s = new PageStructure([
      figure,
      { type: "Formula", alt: null, actualText: null, mcids: [5] },
      { type: "P", alt: null, actualText: null, mcids: [6] },
    ]);
    expect(s.cannotDescribe(3)).toBeNull();
    expect(s.cannotDescribe(5)).toBeNull();
    expect(s.cannotDescribe(6)).toMatch(/P element/);
    expect(s.cannotDescribe(9)).toMatch(/no structure element/);
  });

  test("refuses every description when the save cannot write them", () => {
    expect(
      new PageStructure([figure], "the file is encrypted").cannotDescribe(3),
    ).toBe("the file is encrypted");
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
      { pageIndex: 0, mcid: FIGURE_MCID, alt: "New" },
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
      { pageIndex: 0, mcid: 42, alt: "x" },
    ]);
    await expect(exportToBlob(doc, "sample.pdf")).rejects.toBeInstanceOf(
      StructureEditError,
    );
  });
});
