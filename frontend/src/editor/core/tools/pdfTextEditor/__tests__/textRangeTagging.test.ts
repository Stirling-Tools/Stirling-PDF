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
import {
  rangeTagTypes,
  TagTextRangeCommand,
} from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import { readObjTexts } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  charOrigins,
  readMatrix,
} from "@editor/tools/pdfTextEditor/commands/textPieces";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  isInlineType,
  TEXT_RANGE_TYPES,
  type StructureElement,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import {
  isHeadingType,
  type StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import { elementKids } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  RawPdf,
  referencedObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  innermostMcid,
  readTagMarks,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { headingOutline } from "@editor/tools/pdfTextEditor/util/headingOutline";
import { locateHeading } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// An H1 (MCID 0); a one-line P (MCID 1); a P whose first line is a heading
// merged into it (MCID 2); and a P with a heading merged into its middle
// (MCID 3). Text the file leaves untagged closes the page.
const CONTENT =
  "/H1 <</MCID 0>> BDC BT /F1 20 Tf 72 700 Td (Summary) Tj ET EMC\n" +
  "/P <</MCID 1>> BDC BT /F1 12 Tf 72 670 Td (Sales rose in every region.) Tj ET EMC\n" +
  "/P <</MCID 2>> BDC BT /F1 16 Tf 72 630 Td (Outlook) Tj ET " +
  "BT /F1 12 Tf 72 612 Td (Growth will slow next year.) Tj ET EMC\n" +
  "/P <</MCID 3>> BDC BT /F1 12 Tf 72 560 Td (That ends the outlook.) Tj ET " +
  "BT /F1 16 Tf 72 530 Td (Methods) Tj ET " +
  "BT /F1 12 Tf 72 512 Td (We sampled every store.) Tj ET EMC\n" +
  "BT /F1 12 Tf 72 400 Td (Printed in house) Tj ET\n";

/** Document 7 holds H1 8 and paragraphs 9, 10 and 11, in that order. */
function cutPdf(): Uint8Array {
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
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /StructParents 0 " +
          "/Resources << /Font << /F1 5 0 R >> >> >>",
      },
      { num: 4, body: streamBody("", CONTENT) },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 12 0 R /ParentTreeNextKey 1 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R 9 0 R 10 0 R 11 0 R] >>",
      },
      {
        num: 8,
        body: "<< /Type /StructElem /S /H1 /P 7 0 R /Pg 3 0 R /K 0 >>",
      },
      { num: 9, body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 1 >>" },
      {
        num: 10,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 2 >>",
      },
      {
        num: 11,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 3 >>",
      },
      { num: 12, body: "<< /Nums [0 [8 0 R 9 0 R 10 0 R 11 0 R]] >>" },
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

function runWith(doc: EditorDocument, fragment: string) {
  const run = doc.page(0).runs.find((r) => r.text.includes(fragment));
  if (!run) throw new Error(`no run contains "${fragment}"`);
  return run;
}

function tagRange(
  doc: EditorDocument,
  history: HistoryStack,
  fragment: string,
  as: StructureType,
) {
  const run = runWith(doc, fragment);
  const start = run.text.indexOf(fragment);
  history.execute(
    new TagTextRangeCommand({
      pageIndex: 0,
      runId: run.id,
      start,
      end: start + fragment.length,
      as,
    }),
    doc,
  );
}

async function savedBytes(doc: EditorDocument): Promise<Uint8Array> {
  const { blob } = await exportToBlob(doc, "cut.pdf");
  return new Uint8Array(await blob.arrayBuffer());
}

async function savedHeadings(doc: EditorDocument): Promise<string[]> {
  const structure = await readFileStructure(await savedBytes(doc));
  return structure!.blocks.flatMap(({ type }) =>
    type && isHeadingType(type) ? [type] : [],
  );
}

/** Each MCID's text on page 0, its objects read in page order. */
function textByMcid(doc: EditorDocument): Map<number, string> {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const ptrs = Array.from(
    { length: m.FPDFPage_CountObjects(pagePtr) },
    (_, i) => m.FPDFPage_GetObject(pagePtr, i),
  );
  const texts = readObjTexts(m, pagePtr, ptrs);
  const out = new Map<number, string>();
  ptrs.forEach((ptr, i) => {
    const mcid = innermostMcid(readTagMarks(m, ptr));
    if (mcid !== null) out.set(mcid, (out.get(mcid) ?? "") + (texts[i] ?? ""));
  });
  return out;
}

/** An element's kids: an MCID as its number, a child element as its /S. */
function kidsOf(pdf: RawPdf, num: number): string[] {
  return elementKids(pdf, pdf.objectBody(num)!)!.map((kid) => {
    const ref = referencedObject(kid);
    return ref === null ? kid : `/${pdf.dictName(pdf.objectBody(ref)!, "S")}`;
  });
}

/** The child element of `num` with /S `type`. */
function kidNamed(pdf: RawPdf, num: number, type: string): number {
  const kid = elementKids(pdf, pdf.objectBody(num)!)!
    .map(referencedObject)
    .find(
      (ref) => ref !== null && pdf.dictName(pdf.objectBody(ref)!, "S") === type,
    );
  if (kid == null) throw new Error(`no /${type} under ${num}`);
  return kid;
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

describe("tagging part of an element's text", () => {
  test("saves a Span among its paragraph's kids, where its text is read", async () => {
    const doc = await open(cutPdf());
    tagRange(doc, new HistoryStack(), "every", "Span");

    const bytes = await savedBytes(doc);
    const pdf = (await RawPdf.parse(bytes))!;
    expect(kidsOf(pdf, 9)).toEqual(["1", "/Span", "5"]);
    expect(kidsOf(pdf, kidNamed(pdf, 9, "Span"))).toEqual(["4"]);

    // The part after is the shorter, so it is the one redrawn with an MCID of its own.
    const texts = textByMcid(await open(bytes));
    expect(texts.get(1)?.trim()).toBe("Sales rose in");
    expect(texts.get(4)?.trim()).toBe("every");
    expect(texts.get(5)?.trim()).toBe("region.");
  });

  test("draws the cut text where it was drawn", async () => {
    const doc = await open(cutPdf());
    const m = doc.module;
    const pagePtr = doc.page(0).pagePtr;
    const line = runWith(doc, "every").mergedFromPtrs[0];
    const origin = charOrigins(
      m,
      pagePtr,
      new Map([[line, new Set([14])]]),
      new Map([[line, 27]]),
    )
      .get(line)!
      .get(14)!;
    tagRange(doc, new HistoryStack(), "every", "Span");

    const run = runWith(doc, "every");
    const cut = run.mergedFromPtrs[run.mergedFromTexts.indexOf("every")];
    const matrix = readMatrix(m, cut)!;
    expect(matrix[4]).toBeCloseTo(origin.x, 3);
    expect(matrix[5]).toBeCloseTo(origin.y, 3);
  });

  test("splits a heading out of the start of its paragraph", async () => {
    const doc = await open(cutPdf());
    tagRange(doc, new HistoryStack(), "Outlook", "H2");
    expect(doc.headings()!.map((h) => h.type)).toEqual(["H1", "H2"]);

    const pdf = (await RawPdf.parse(await savedBytes(doc)))!;
    expect(kidsOf(pdf, 7)).toEqual(["/H1", "/P", "/H2", "/P", "/P"]);
    expect(kidsOf(pdf, 10)).toEqual(["2"]);
    expect(kidsOf(pdf, kidNamed(pdf, 7, "H2"))).toEqual(["4"]);
  });

  test("outlines two headings cut from one paragraph as the save orders them", async () => {
    const doc = await open(cutPdf());
    const history = new HistoryStack();
    tagRange(doc, history, "Methods", "H2");
    tagRange(doc, history, "sampled", "H3");
    expect(doc.headings()!.map((h) => h.type)).toEqual(["H1", "H2", "H3"]);
    expect(await savedHeadings(doc)).toEqual(["H1", "H2", "H3"]);
  });

  test("outlines the part of a split heading read after the cut", async () => {
    const doc = await open(cutPdf());
    doc.setRetag(0, 1, "H2");
    tagRange(doc, new HistoryStack(), "every", "P");
    expect(doc.headings()!.map((h) => h.type)).toEqual(["H1", "H2", "H2"]);
    expect(await savedHeadings(doc)).toEqual(["H1", "H2", "H2"]);
  });

  test("finds the text of a heading cut from a run", async () => {
    const doc = await open(cutPdf());
    tagRange(doc, new HistoryStack(), "Methods", "H2");
    const { entries } = headingOutline(
      doc.headings()!,
      [
        {
          pageIndex: 0,
          runs: doc.page(0).runs.map((r) => r.snapshot()),
        } as PageSnapshot,
      ],
      (heading) => locateHeading(doc, heading),
    );
    const { run, range } = entries[1];
    expect(run!.text.slice(range!.start, range!.end)).toBe("Methods");
  });

  test("splits a paragraph in two around a heading in its middle", async () => {
    const doc = await open(cutPdf());
    tagRange(doc, new HistoryStack(), "Methods", "H2");

    const bytes = await savedBytes(doc);
    const pdf = (await RawPdf.parse(bytes))!;
    expect(kidsOf(pdf, 7)).toEqual(["/H1", "/P", "/P", "/P", "/H2", "/P"]);
    // The part before is the shorter, so it is redrawn with an MCID of its own.
    expect(kidsOf(pdf, 11)).toEqual(["5"]);
    const rest = referencedObject(
      elementKids(pdf, pdf.objectBody(7)!)!.at(-1)!,
    )!;
    expect(kidsOf(pdf, rest)).toEqual(["3"]);

    const texts = textByMcid(await open(bytes));
    expect(texts.get(5)?.trim()).toBe("That ends the outlook.");
    expect(texts.get(4)?.trim()).toBe("Methods");
    expect(texts.get(3)?.trim()).toBe("We sampled every store.");
  });

  test("puts the text back as it was on undo, and cuts it again on redo", async () => {
    const doc = await open(cutPdf());
    const before = textByMcid(doc);
    const history = new HistoryStack();
    tagRange(doc, history, "every", "Span");

    history.undo(doc);
    expect(textByMcid(doc)).toEqual(before);
    expect(doc.structureEdits()).toEqual([]);

    history.redo(doc);
    expect(doc.structureEdits()).toMatchObject([
      { mcid: 4, cut: { type: "Span", from: [1], before: 1, after: 5 } },
    ]);
  });

  test("tags a word of a real file's paragraph as a Span inside it", async () => {
    const sample = path.join(
      import.meta.dirname,
      "../../../tests/test-fixtures/tagged-sample.pdf",
    );
    const doc = await EditorDocument.open(
      new Uint8Array(await readFile(sample)),
    );
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(1));
    const run = doc.page(1).runs.find((r) => r.text.includes("All amounts"))!;
    const paragraph = doc.structure(1).block(run.snapshot().mcid!)!.key;
    const spansIn = (elements: readonly StructureElement[]) =>
      elements.filter((el) => el.type === "Span" && el.block.key === paragraph)
        .length;
    expect(spansIn(doc.structure(1).elements)).toBe(0);
    const start = run.text.indexOf("amounts");
    new HistoryStack().execute(
      new TagTextRangeCommand({
        pageIndex: 1,
        runId: run.id,
        start,
        end: start + "amounts".length,
        as: "Span",
      }),
      doc,
    );

    const saved = await readFileStructure(await savedBytes(doc));
    expect(spansIn(saved!.pages.get(1)!.elements)).toBe(1);
  });

  test("refuses untagged text, and changes nothing", async () => {
    const doc = await open(cutPdf());
    const before = textByMcid(doc);
    expect(() =>
      tagRange(doc, new HistoryStack(), "Printed", "Span"),
    ).toThrow();
    expect(textByMcid(doc)).toEqual(before);
    expect(doc.structureEdits()).toEqual([]);
  });
});

describe("which tags part of a run's text can take", () => {
  const typesFor = (
    doc: EditorDocument,
    pageIndex: number,
    fragment: string,
    within = fragment,
  ) => {
    const run = doc.page(pageIndex).runs.find((r) => r.text.includes(within))!;
    const start = run.text.indexOf(fragment);
    return rangeTagTypes(
      doc,
      pageIndex,
      run.id,
      start,
      start + fragment.length,
    );
  };

  test("offers every type for text inside a block it can split", async () => {
    const doc = await open(cutPdf());
    expect(typesFor(doc, 0, "rose in every")).toEqual([...TEXT_RANGE_TYPES]);
  });

  test("offers only inline types for text in an inline element", async () => {
    const doc = await EditorDocument.open(
      new Uint8Array(
        await readFile(
          path.join(
            import.meta.dirname,
            "../../../tests/test-fixtures/tagged-sample.pdf",
          ),
        ),
      ),
    );
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(1));
    expect(typesFor(doc, 1, "appendix")).toEqual(
      TEXT_RANGE_TYPES.filter(isInlineType),
    );
    expect(typesFor(doc, 1, "in the appendix")).toEqual([]);
  });

  test("offers none for untagged text or only spaces", async () => {
    const doc = await open(cutPdf());
    expect(typesFor(doc, 0, "Printed")).toEqual([]);
    expect(typesFor(doc, 0, " ", "Sales rose")).toEqual([]);
  });
});
