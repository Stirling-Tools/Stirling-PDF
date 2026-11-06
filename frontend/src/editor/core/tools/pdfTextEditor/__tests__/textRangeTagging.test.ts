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
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { RetagInnerCommand } from "@editor/tools/pdfTextEditor/commands/RetagInnerCommand";
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
import {
  innerTags,
  locateHeading,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";
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

/** A page whose one paragraph (MCID 0) draws `line`, a text-showing operation with its spacing set before it. */
function linePdf(line: string): Uint8Array {
  return paragraphPdf(`BT /F1 12 Tf 72 700 Td ${line} ET`);
}

/** A page whose one paragraph (MCID 0) is drawn by `content`, with font F1 Helvetica. */
function paragraphPdf(content: string): Uint8Array {
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
      {
        num: 4,
        body: streamBody("", `/P <</MCID 0>> BDC ${content} EMC\n`),
      },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 9 0 R /ParentTreeNextKey 1 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R] >>",
      },
      { num: 8, body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>" },
      { num: 9, body: "<< /Nums [0 [8 0 R]] >>" },
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

async function openSample(): Promise<EditorDocument> {
  const sample = path.join(
    import.meta.dirname,
    "../../../tests/test-fixtures/tagged-sample.pdf",
  );
  const doc = await EditorDocument.open(new Uint8Array(await readFile(sample)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(1));
  return doc;
}

/**
 * Chrome's "Save as PDF" output: each glyph an object of its own and each
 * word space another, in fonts subset to the glyphs each draws, with some
 * text inside a form XObject.
 */
async function openChromePdf(): Promise<EditorDocument> {
  const file = path.join(
    import.meta.dirname,
    "../../../tests/test-fixtures/stirling-marketing.pdf",
  );
  return open(new Uint8Array(await readFile(file)));
}

function runWith(doc: EditorDocument, fragment: string, pageIndex = 0) {
  const run = doc.page(pageIndex).runs.find((r) => r.text.includes(fragment));
  if (!run) throw new Error(`no run contains "${fragment}"`);
  return run;
}

function tagRange(
  doc: EditorDocument,
  history: HistoryStack,
  fragment: string,
  as: StructureType,
  pageIndex = 0,
): TagTextRangeCommand {
  const run = runWith(doc, fragment, pageIndex);
  const start = run.text.indexOf(fragment);
  const command = new TagTextRangeCommand({
    pageIndex,
    runId: run.id,
    start,
    end: start + fragment.length,
    as,
  });
  history.execute(command, doc);
  return command;
}

/** Replace `from` with `to` in the run holding `from`, as typing would. */
function editText(
  doc: EditorDocument,
  history: HistoryStack,
  from: string,
  to: string,
  pageIndex = 0,
) {
  const run = runWith(doc, from, pageIndex);
  history.execute(
    new EditTextCommand({
      pageIndex,
      runId: run.id,
      nextText: run.text.replace(from, to),
    }),
    doc,
  );
}

function runTexts(doc: EditorDocument, pageIndex = 0): string[] {
  return doc.page(pageIndex).runs.map((run) => run.text.trim());
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

interface Glyph {
  char: string;
  x: number;
  y: number;
}

/** Every glyph page 0 draws with ink, line by line from the top, left to right. */
function inkGlyphs(doc: EditorDocument): Glyph[] {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const x = m.pdfium.wasmExports.malloc(8);
  const y = m.pdfium.wasmExports.malloc(8);
  const glyphs: Glyph[] = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      const char = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (m.FPDFText_IsGenerated(textPage, i) === 1 || !/\S/.test(char)) {
        continue;
      }
      m.FPDFText_GetCharOrigin(textPage, i, x, y);
      glyphs.push({
        char,
        x: m.pdfium.getValue(x, "double"),
        y: m.pdfium.getValue(y, "double"),
      });
    }
  } finally {
    m.pdfium.wasmExports.free(x);
    m.pdfium.wasmExports.free(y);
    m.FPDFText_ClosePage(textPage);
  }
  const line = (glyph: Glyph) => Math.round(glyph.y * 10);
  return glyphs.sort((a, b) => line(b) - line(a) || a.x - b.x);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Every glyph of `glyphs` within 0.01 pt of where `at` draws it. */
function expectDrawnAt(glyphs: Glyph[], at: Glyph[]): void {
  expect(glyphs.map((g) => g.char).join("")).toBe(
    at.map((g) => g.char).join(""),
  );
  const moved = glyphs.map((g, i) => Math.hypot(g.x - at[i].x, g.y - at[i].y));
  expect(Math.max(...moved)).toBeLessThanOrEqual(0.01);
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
      new Map([[line, "Sales rose in every region."]]),
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
    const doc = await openSample();
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

describe("tagging part of a spaced or kerned line", () => {
  test.each([
    [
      "character and word spacing",
      "0.4 Tc 3 Tw (Costs fell in most markets last year.) Tj",
    ],
    [
      "kerning",
      "[(Co) -40 (sts) 60 ( fe) 25 (ll) -120 ( in) 80 ( most) -50 ( mar) 15 (kets) 30 ( last year.)] TJ",
    ],
    [
      "word spaces drawn as gaps",
      "[(Costs) -333 (fell) -333 (in) -333 (most) -333 (markets) -333 (last) -333 (year.)] TJ",
    ],
  ])(
    "draws every glyph of a line with %s where it was drawn, and saves it there",
    async (_, line) => {
      const doc = await open(linePdf(line));
      const text = runWith(doc, "Costs").text;
      const before = inkGlyphs(doc);
      tagRange(doc, new HistoryStack(), "fell in most", "Span");
      expectDrawnAt(inkGlyphs(doc), before);

      const saved = await open(await savedBytes(doc));
      expectDrawnAt(inkGlyphs(saved), before);
      const run = runWith(saved, "Costs");
      expect(words(run.text)).toEqual(words(text));
      expect(
        innerTags(saved, run.snapshot()).map(({ text, role }) => [
          text.trim(),
          role.type,
        ]),
      ).toEqual([["fell in most", "Span"]]);
    },
  );

  test("refuses a cut that would read spaces into widely letter-spaced words, and changes nothing", async () => {
    const doc = await open(
      linePdf("1.5 Tc 4 Tw (Costs fell in most markets last year.) Tj"),
    );
    const before = inkGlyphs(doc);
    const objects = doc.module.FPDFPage_CountObjects(doc.page(0).pagePtr);
    expect(() =>
      tagRange(doc, new HistoryStack(), "fell in most", "Span"),
    ).toThrow();
    expectDrawnAt(inkGlyphs(doc), before);
    expect(doc.module.FPDFPage_CountObjects(doc.page(0).pagePtr)).toBe(objects);
    expect(doc.structureEdits()).toEqual([]);
  });
});

describe("tagging part of a line of a Chrome-produced file", () => {
  test("draws every glyph where it was, and saves the text it tagged", async () => {
    const doc = await openChromePdf();
    const text = runWith(doc, "Free Adobe").text;
    const before = inkGlyphs(doc);
    tagRange(doc, new HistoryStack(), "Free Adobe", "Span");
    expectDrawnAt(inkGlyphs(doc), before);

    const saved = await open(await savedBytes(doc));
    expectDrawnAt(inkGlyphs(saved), before);
    const run = runWith(saved, "Free Adobe");
    expect(words(run.text)).toEqual(words(text));
    // Chrome wraps the heading's text in a NonStruct, which keeps the text
    // either side.
    expect(
      innerTags(saved, run.snapshot()).map(({ text, role }) => [
        text.trim(),
        role.type,
      ]),
    ).toEqual([
      ["The", "NonStruct"],
      ["Free Adobe", "Span"],
      ["Acrobat Alternative", "NonStruct"],
    ]);
  });

  test("offers no tag for part of text inside a form XObject, which apply refuses", async () => {
    const doc = await openChromePdf();
    const run = runWith(doc, "Open Source");
    const start = run.text.indexOf("Source");
    const end = start + "Source".length;
    expect(rangeTagTypes(doc, 0, run.id, start, end)).toEqual([]);
    const cut = new TagTextRangeCommand({
      pageIndex: 0,
      runId: run.id,
      start,
      end,
      as: "Span",
    });
    expect(() => new HistoryStack().execute(cut, doc)).toThrow();
  });
});

describe("a block cut from part of a run", () => {
  test("gets a run of its own, as a read of the page groups it", async () => {
    const doc = await open(cutPdf());
    const run = runWith(doc, "We sampled");
    const cut = tagRange(doc, new HistoryStack(), "sampled", "H3");

    expect(doc.page(0).findRun(run.id)).toBeUndefined();
    expect(doc.page(0).findRun(cut.movedToRunId!)!.text.trim()).toBe("sampled");
    expect(runTexts(doc).slice(5, 9)).toEqual([
      "Methods",
      "We",
      "sampled",
      "every store.",
    ]);
  });

  test("leaves a run cut whole as it was", async () => {
    const doc = await open(cutPdf());
    const run = runWith(doc, "Outlook");
    const cut = tagRange(doc, new HistoryStack(), "Outlook", "H2");
    expect(cut.movedToRunId).toBeNull();
    expect(doc.page(0).findRun(run.id)!.snapshot().mcid).toBe(4);
  });

  test.each([
    ["the text before it", "We", "They"],
    ["the text after it", "store", "shop"],
  ])("survives an edit of %s", async (_part, from, to) => {
    const doc = await open(cutPdf());
    const history = new HistoryStack();
    tagRange(doc, history, "sampled", "H3");
    editText(doc, history, from, to);

    expect(doc.headings()!.map((h) => h.type)).toEqual(["H1", "H3"]);
    const bytes = await savedBytes(doc);
    expect(await savedHeadings(doc)).toEqual(["H1", "H3"]);
    expect(
      textByMcid(await open(bytes))
        .get(4)
        ?.trim(),
    ).toBe("sampled");
  });

  test("survives an edit of the paragraph it was cut from", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    const headings = () =>
      doc.headings()!.filter((h) => h.type === "H4").length;
    tagRange(doc, history, "Atlas product line", "H4", 1);
    expect(headings()).toBe(1);
    expect(runWith(doc, "Revenue rose", 1).text).toContain(
      "and the launch of the",
    );

    editText(doc, history, "Canada", "Mexico", 1);
    expect(headings()).toBe(1);
    const saved = await savedHeadings(doc);
    expect(saved.filter((type) => type === "H4")).toHaveLength(1);
  });

  test("puts the run back on undo, and splits it the same way on redo", async () => {
    const doc = await open(cutPdf());
    const history = new HistoryStack();
    const before = doc.page(0).runs.map((r) => [r.id, r.text]);
    tagRange(doc, history, "sampled", "H3");
    const split = doc.page(0).runs.map((r) => r.id);
    editText(doc, history, "store", "shop");

    history.undo(doc);
    history.undo(doc);
    expect(doc.page(0).runs.map((r) => [r.id, r.text])).toEqual(before);

    history.redo(doc);
    history.redo(doc);
    expect(doc.page(0).runs.map((r) => r.id)).toEqual(split);
    expect(runWith(doc, "shop").text.trim()).toBe("every shop.");
  });

  test("is made when an inline cut is retagged as a block", async () => {
    const doc = await open(cutPdf());
    const history = new HistoryStack();
    tagRange(doc, history, "every", "Span");
    const [span] = innerTags(doc, runWith(doc, "Sales rose").snapshot());
    const retag = new RetagInnerCommand({
      pageIndex: 0,
      key: span.key,
      type: "H2",
    });
    history.execute(retag, doc);
    expect(doc.page(0).findRun(retag.movedToRunId!)!.text.trim()).toBe("every");

    editText(doc, history, "region", "area");
    expect(await savedHeadings(doc)).toEqual(["H1", "H2"]);

    history.undo(doc);
    history.undo(doc);
    expect(innerTags(doc, runWith(doc, "Sales rose").snapshot())).toMatchObject(
      [{ text: "every", role: { type: "Span" } }],
    );
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
    const doc = await openSample();
    expect(typesFor(doc, 1, "appendix")).toEqual(
      TEXT_RANGE_TYPES.filter(isInlineType),
    );
    expect(typesFor(doc, 1, "in the appendix")).toEqual([]);
  });

  test("offers none for text its element draws out of reading order, which apply refuses", async () => {
    const doc = await open(
      paragraphPdf(
        "BT /F1 12 Tf 72 700 Td (Sales ) Tj ET " +
          "BT /F1 12 Tf 176.06 700 Td (region.) Tj ET " +
          "BT /F1 12 Tf 105.35 700 Td (rose in every ) Tj ET",
      ),
    );
    const run = runWith(doc, "Sales rose in every region.");
    const end = "Sales rose".length;
    expect(rangeTagTypes(doc, 0, run.id, 0, end)).toEqual([]);
    expect(() =>
      tagRange(doc, new HistoryStack(), "Sales rose", "Span"),
    ).toThrow();
  });

  test("offers none for untagged text or only spaces", async () => {
    const doc = await open(cutPdf());
    expect(typesFor(doc, 0, "Printed")).toEqual([]);
    expect(typesFor(doc, 0, " ", "Sales rose")).toEqual([]);
  });
});
