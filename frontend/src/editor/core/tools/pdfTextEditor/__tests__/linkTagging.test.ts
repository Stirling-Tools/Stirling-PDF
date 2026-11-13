// @vitest-environment node
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
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { linkTexts } from "@editor/tools/pdfTextEditor/commands/linkText";
import { SetLinkContentsCommand } from "@editor/tools/pdfTextEditor/commands/SetLinkContentsCommand";
import {
  TagLinkCommand,
  taggableLinks,
} from "@editor/tools/pdfTextEditor/commands/TagLinkCommand";
import {
  TagPageContentCommand,
  hasUntaggedContent,
} from "@editor/tools/pdfTextEditor/commands/TagPageContentCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { elementKids } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  RawPdf,
  referencedObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { innerTags } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import {
  buildClassicPdf,
  streamBody,
  type FixtureObject,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const LINE = "Visit stirlingpdf.com today.";
// In 12 pt Helvetica from x 72, "Visit " is 26.0 pt wide and the address
// 77.4 pt, so this covers the address and neither space beside it.
const ADDRESS_RECT = "[97 696 176 710]";
const LINK = 20;

function linkAnnotation(extra = ""): FixtureObject {
  return {
    num: LINK,
    body: `<< /Type /Annot /Subtype /Link /Rect ${ADDRESS_RECT} /Border [0 0 0] /A << /S /URI /URI (https://stirlingpdf.com) >>${extra} >>`,
  };
}

function page(content: string, extra = ""): FixtureObject[] {
  return [
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      num: 3,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Annots [${LINK} 0 R]${extra} ` +
        "/Resources << /Font << /F1 5 0 R >> >> >>",
    },
    { num: 4, body: streamBody("", content) },
    { num: 5, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
  ];
}

/** No structure tree; `LINE` drawn with the link over its address. */
function untaggedPdf(link = linkAnnotation()): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      ...page(`BT /F1 12 Tf 72 700 Td (${LINE}) Tj ET\n`),
      link,
    ],
    1,
  );
}

/**
 * `LINE` tagged as paragraph 9 (MCID 0) in Document 8, or with
 * `linkElement` its address a Link 10 (MCID 1) in it, its text after MCID 2.
 */
function taggedPdf({
  linkElement = false,
  link = linkAnnotation(),
  parentTree = "",
} = {}): Uint8Array {
  const content = linkElement
    ? "/P <</MCID 0>> BDC BT /F1 12 Tf 72 700 Td (Visit ) Tj ET EMC\n" +
      "/Link <</MCID 1>> BDC BT /F1 12 Tf 98.004 700 Td (stirlingpdf.com) Tj ET EMC\n" +
      "/P <</MCID 2>> BDC BT /F1 12 Tf 175.356 700 Td ( today.) Tj ET EMC\n"
    : `/P <</MCID 0>> BDC BT /F1 12 Tf 72 700 Td (${LINE}) Tj ET EMC\n`;
  const slots = linkElement ? "[9 0 R 10 0 R 9 0 R]" : "[9 0 R]";
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R >>",
      },
      ...page(content, " /StructParents 0"),
      {
        num: 7,
        body: `<< /Type /StructTreeRoot /K 8 0 R /ParentTree << /Nums [0 ${slots}${parentTree}] >> /ParentTreeNextKey 2 >>`,
      },
      {
        num: 8,
        body: "<< /Type /StructElem /S /Document /P 7 0 R /K [9 0 R] >>",
      },
      {
        num: 9,
        body: `<< /Type /StructElem /S /P /P 8 0 R /Pg 3 0 R /K ${linkElement ? "[0 10 0 R 2]" : "0"} >>`,
      },
      ...(linkElement
        ? [
            {
              num: 10,
              body: "<< /Type /StructElem /S /Link /P 9 0 R /Pg 3 0 R /K 1 >>",
            },
          ]
        : []),
      link,
    ],
    1,
  );
}

const opened: EditorDocument[] = [];

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

async function savedBytes(doc: EditorDocument): Promise<Uint8Array> {
  const { blob } = await exportToBlob(doc, "links.pdf");
  return new Uint8Array(await blob.arrayBuffer());
}

async function saved(doc: EditorDocument): Promise<RawPdf> {
  return (await RawPdf.parse(await savedBytes(doc)))!;
}

function documentElement(pdf: RawPdf): number {
  const catalog = pdf.objectBody(pdf.rootNum)!;
  const root = pdf.objectBody(pdf.dictRef(catalog, "StructTreeRoot")!)!;
  return pdf.dictRef(root, "K")!;
}

/** An element's kids: an MCID as its number, an element as its /S, an OBJR as `OBJR n` for the object it names. */
function kidsOf(pdf: RawPdf, num: number): string[] {
  return elementKids(pdf, pdf.objectBody(num)!)!.map((kid) => {
    const ref = referencedObject(kid);
    if (ref !== null) return `/${pdf.dictName(pdf.objectBody(ref)!, "S")}`;
    if (!kid.startsWith("<<")) return kid;
    return `${pdf.dictName(kid, "Type")} ${pdf.dictRef(kid, "Obj")}`;
  });
}

function kidNamed(pdf: RawPdf, num: number, type: string): number {
  const kid = elementKids(pdf, pdf.objectBody(num)!)!
    .map(referencedObject)
    .find(
      (ref) => ref !== null && pdf.dictName(pdf.objectBody(ref)!, "S") === type,
    );
  if (kid == null) throw new Error(`no /${type} under ${num}`);
  return kid;
}

/** The element the link's /StructParent entry names; null when it has none. */
function holder(pdf: RawPdf): number | null {
  const catalog = pdf.objectBody(pdf.rootNum)!;
  const key = pdf.dictInt(pdf.objectBody(LINK)!, "StructParent");
  if (key === null) return null;
  const entry = pdf.numberTreeEntry(
    pdf.dictRef(catalog, "StructTreeRoot")!,
    "ParentTree",
    key,
  );
  return entry ? referencedObject(entry.span.text) : null;
}

function contents(pdf: RawPdf): string | null {
  const span = pdf.valueSpan(pdf.objectBody(LINK)!, "Contents");
  return span && decodeTextString(span.text);
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

describe("reading link annotations", () => {
  test("reads each link the page references, with what it covers and who holds it", async () => {
    const structure = await readFileStructure(
      taggedPdf({
        link: linkAnnotation(
          " /StructParent 1 /Contents (Our site) /QuadPoints [97 710 176 710 97 696 176 696]",
        ),
        parentTree: " 1 9 0 R",
      }),
    );
    expect(structure!.links.get(0)).toEqual([
      {
        annotation: LINK,
        areas: [{ left: 97, bottom: 696, right: 176, top: 710 }],
        contents: "Our site",
        holder: "9",
      },
    ]);
  });

  test("reads links in a file with no structure tree", async () => {
    const structure = await readFileStructure(untaggedPdf());
    expect(structure!.links.get(0)).toEqual([
      {
        annotation: LINK,
        areas: [{ left: 97, bottom: 696, right: 176, top: 710 }],
        contents: null,
        holder: null,
      },
    ]);
  });

  test("finds the run text a link covers", async () => {
    const doc = await open(untaggedPdf());
    const [link] = doc.structure(0).links();
    const text = linkTexts(doc, 0, [link]).get(LINK)!;
    const run = doc.page(0).findRun(text.runId)!;
    expect(run.text.slice(text.start, text.end)).toBe("stirlingpdf.com");
  });
});

describe("tagging links", () => {
  test("tags a page's link as a Link in its paragraph, holding the annotation", async () => {
    const doc = await open(untaggedPdf());
    new HistoryStack().execute(
      new TagPageContentCommand({ pageIndex: 0 }),
      doc,
    );

    const bytes = await savedBytes(doc);
    const pdf = (await RawPdf.parse(bytes))!;
    const paragraph = kidNamed(pdf, documentElement(pdf), "P");
    expect(kidsOf(pdf, paragraph)).toEqual([
      expect.any(String),
      "/Link",
      expect.any(String),
    ]);
    const link = kidNamed(pdf, paragraph, "Link");
    expect(kidsOf(pdf, link)).toEqual([expect.any(String), `OBJR ${LINK}`]);
    expect(holder(pdf)).toBe(link);
    expect(contents(pdf)).toBe("stirlingpdf.com");
    expect(pdf.dictName(pdf.objectBody(3)!, "Tabs")).toBe("S");

    const reopened = await open(bytes);
    expect(reopened.structure(0).linkHeld(LINK)).toBe(true);
    expect(reopened.structure(0).linkContents(LINK)).toBe("stirlingpdf.com");
  });

  test("keeps the description a link already has", async () => {
    const doc = await open(
      untaggedPdf(linkAnnotation(" /Contents (Stirling PDF home)")),
    );
    new HistoryStack().execute(
      new TagPageContentCommand({ pageIndex: 0 }),
      doc,
    );
    const pdf = await saved(doc);
    expect(contents(pdf)).toBe("Stirling PDF home");
    expect(holder(pdf)).not.toBeNull();
  });

  test("undoing the page's tags leaves the link as it was", async () => {
    const doc = await open(untaggedPdf());
    const history = new HistoryStack();
    history.execute(new TagPageContentCommand({ pageIndex: 0 }), doc);
    history.undo(doc);
    expect(doc.annotationEdits()).toEqual([]);
    history.redo(doc);
    expect(doc.annotationEdits()).toEqual([
      expect.objectContaining({
        annotation: LINK,
        contents: "stirlingpdf.com",
      }),
    ]);
    expect(holder(await saved(doc))).not.toBeNull();
  });

  test("tags the untagged link on a page whose text is tagged", async () => {
    const doc = await open(taggedPdf());
    expect(hasUntaggedContent(doc, 0)).toBe(true);
    new HistoryStack().execute(
      new TagPageContentCommand({ pageIndex: 0 }),
      doc,
    );
    expect(hasUntaggedContent(doc, 0)).toBe(false);

    const pdf = await saved(doc);
    expect(kidsOf(pdf, 9)).toEqual([
      expect.any(String),
      "/Link",
      expect.any(String),
    ]);
    expect(holder(pdf)).toBe(kidNamed(pdf, 9, "Link"));
  });

  test("gives the link to the Link its text already is", async () => {
    const doc = await open(taggedPdf({ linkElement: true }));
    new HistoryStack().execute(
      new TagLinkCommand({ pageIndex: 0, annotation: LINK }),
      doc,
    );
    const pdf = await saved(doc);
    expect(kidsOf(pdf, 9)).toEqual(["0", "/Link", "2"]);
    expect(kidsOf(pdf, 10)).toEqual(["1", `OBJR ${LINK}`]);
    expect(holder(pdf)).toBe(10);
  });

  test("leaves a tagged link unheld once its text is deleted, keeping its description", async () => {
    const doc = await open(taggedPdf());
    const history = new HistoryStack();
    history.execute(
      new TagLinkCommand({ pageIndex: 0, annotation: LINK }),
      doc,
    );
    const run = doc.page(0).runs.find((r) => r.text.includes("stirlingpdf"))!;
    history.execute(
      new DeleteObjectCommand({ pageIndex: 0, runId: run.id }),
      doc,
    );

    const pdf = await saved(doc);
    expect(holder(pdf)).toBeNull();
    expect(contents(pdf)).toBe("stirlingpdf.com");
  });

  test("leaves a link the file already gives an element alone", async () => {
    const doc = await open(
      taggedPdf({
        linkElement: true,
        link: linkAnnotation(" /StructParent 1"),
        parentTree: " 1 10 0 R",
      }),
    );
    expect(hasUntaggedContent(doc, 0)).toBe(false);
    expect(() =>
      new HistoryStack().execute(
        new TagLinkCommand({ pageIndex: 0, annotation: LINK }),
        doc,
      ),
    ).toThrow();
  });
});

describe("describing links", () => {
  function linkTag(doc: EditorDocument) {
    const run = doc.page(0).runs.find((r) => r.text.includes("stirlingpdf"))!;
    return innerTags(doc, run.snapshot()).find(
      (tag) => tag.role.type === "Link",
    );
  }

  test("shows the link a tagged Link holds, and its description", async () => {
    const doc = await open(taggedPdf());
    new HistoryStack().execute(
      new TagLinkCommand({ pageIndex: 0, annotation: LINK }),
      doc,
    );
    expect(linkTag(doc)?.link).toEqual({
      annotations: [LINK],
      description: "stirlingpdf.com",
      editable: true,
    });
  });

  test("saves an edited description, and undoing it restores the one before", async () => {
    const doc = await open(taggedPdf());
    const history = new HistoryStack();
    history.execute(
      new TagLinkCommand({ pageIndex: 0, annotation: LINK }),
      doc,
    );
    history.execute(
      new SetLinkContentsCommand({
        pageIndex: 0,
        annotations: [LINK],
        contents: "Stirling PDF home page",
      }),
      doc,
    );
    expect(contents(await saved(doc))).toBe("Stirling PDF home page");
    history.undo(doc);
    expect(linkTag(doc)?.link?.description).toBe("stirlingpdf.com");
  });

  test("describes a link the file already gives an element without moving it", async () => {
    const doc = await open(
      taggedPdf({
        linkElement: true,
        link: linkAnnotation(" /StructParent 1 /Contents (Old)"),
        parentTree: " 1 10 0 R",
      }),
    );
    expect(linkTag(doc)?.link?.description).toBe("Old");
    new HistoryStack().execute(
      new SetLinkContentsCommand({
        pageIndex: 0,
        annotations: [LINK],
        contents: "New",
      }),
      doc,
    );
    expect(doc.annotationEdits()).toEqual([
      { pageIndex: 0, annotation: LINK, contents: "New" },
    ]);
    const pdf = await saved(doc);
    expect(contents(pdf)).toBe("New");
    expect(holder(pdf)).toBe(10);
  });

  test("lists a run's untagged links, and no other run's", async () => {
    const doc = await open(taggedPdf());
    const run = doc.page(0).runs.find((r) => r.text.includes("stirlingpdf"))!;
    expect(taggableLinks(doc, 0, run.id).map((l) => l.annotation)).toEqual([
      LINK,
    ]);
    expect(taggableLinks(doc, 0, "another run")).toEqual([]);
  });
});

describe("links in a word processor's tagged export", () => {
  const SAMPLE = path.join(
    import.meta.dirname,
    "../../../tests/test-fixtures/tagged-sample.pdf",
  );
  const PAGE = 1;

  async function sampleStructure() {
    return (await readFileStructure(new Uint8Array(await readFile(SAMPLE))))!;
  }

  async function openSample(): Promise<EditorDocument> {
    const doc = await EditorDocument.open(
      new Uint8Array(await readFile(SAMPLE)),
    );
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(PAGE));
    return doc;
  }

  test("reads the link its Link holds, and the one nothing holds", async () => {
    const structure = await sampleStructure();
    const link = structure.pages
      .get(PAGE)!
      .elements.find((el) => el.type === "Link")!;
    expect(
      structure.links
        .get(PAGE)!
        .map(({ contents, holder }) => ({ contents, holder })),
    ).toEqual([
      { contents: "Appendix: method", holder: link.key },
      { contents: null, holder: null },
    ]);
  });

  test("shows the description of the link the file's Link holds", async () => {
    const doc = await openSample();
    const run = doc.page(PAGE).runs.find((r) => r.text.includes("appendix"))!;
    const tag = innerTags(doc, run.snapshot()).find(
      (inner) => inner.role.type === "Link",
    );
    expect(tag?.link).toMatchObject({
      description: "Appendix: method",
      editable: true,
    });
  });

  test("tags the link nothing holds as a Link of the word it covers", async () => {
    const appendixHolder = (await sampleStructure()).links.get(PAGE)![0].holder;
    const doc = await openSample();
    const [atlas] = taggableLinks(doc, PAGE);
    const run = doc.page(PAGE).findRun(atlas.text.runId)!;
    expect(run.text.slice(atlas.text.start, atlas.text.end)).toBe("Atlas");
    new HistoryStack().execute(
      new TagLinkCommand({ pageIndex: PAGE, annotation: atlas.annotation }),
      doc,
    );

    const structure = (await readFileStructure(await savedBytes(doc)))!;
    const [appendix, tagged] = structure.links.get(PAGE)!;
    expect(appendix).toMatchObject({
      contents: "Appendix: method",
      holder: appendixHolder,
    });
    expect(tagged.contents).toBe("Atlas");
    expect(
      structure.pages.get(PAGE)!.elements.find((el) => el.key === tagged.holder)
        ?.type,
    ).toBe("Link");
  });
});
