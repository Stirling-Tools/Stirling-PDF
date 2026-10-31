// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  containingBlock,
  type StructureBlock,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import { structureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import { RetagTextCommand } from "@editor/tools/pdfTextEditor/commands/RetagTextCommand";
import { TagTextCommand } from "@editor/tools/pdfTextEditor/commands/TagTextCommand";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// One font, size and left edge throughout, at body line spacing, so geometry
// alone would group all but the list into one paragraph.
const CONTENT =
  "/H1 <</MCID 0>> BDC BT /F1 12 Tf 72 700 Td (Introduction) Tj ET EMC\n" +
  "/P <</MCID 1>> BDC BT /F1 12 Tf 72 686 Td (Read the ) Tj ET EMC\n" +
  "/Link <</MCID 2>> BDC BT /F1 12 Tf 126 686 Td (guide ) Tj ET EMC\n" +
  "/P <</MCID 3>> BDC BT /F1 12 Tf 160 686 Td (for details.) Tj ET EMC\n" +
  "/P <</MCID 4>> BDC BT /F1 12 Tf 72 672 Td (More text.) Tj ET EMC\n" +
  "/P <</MCID 5>> BDC BT /F1 12 Tf 72 658 Td (Second paragraph.) Tj ET EMC\n" +
  "/Lbl <</MCID 6>> BDC BT /F1 12 Tf 72 630 Td (1.) Tj ET EMC\n" +
  "/LBody <</MCID 7>> BDC BT /F1 12 Tf 84 630 Td (Item) Tj ET EMC\n";

/** H1, then a P holding a Link, a second P, and a one-item list. */
function paragraphsPdf({ tagged = true } = {}): Uint8Array {
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
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 20 0 R /ParentTreeNextKey 1 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R 9 0 R 11 0 R 12 0 R] >>",
      },
      {
        num: 8,
        body: "<< /Type /StructElem /S /H1 /P 7 0 R /Pg 3 0 R /K 0 >>",
      },
      {
        num: 9,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K [1 10 0 R 3 4] >>",
      },
      {
        num: 10,
        body: "<< /Type /StructElem /S /Link /P 9 0 R /Pg 3 0 R /K 2 >>",
      },
      {
        num: 11,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 5 >>",
      },
      {
        num: 12,
        body: "<< /Type /StructElem /S /L /P 7 0 R /K 13 0 R >>",
      },
      {
        num: 13,
        body: "<< /Type /StructElem /S /LI /P 12 0 R /K [14 0 R 15 0 R] >>",
      },
      {
        num: 14,
        body: "<< /Type /StructElem /S /Lbl /P 13 0 R /Pg 3 0 R /K 6 >>",
      },
      {
        num: 15,
        body: "<< /Type /StructElem /S /LBody /P 13 0 R /Pg 3 0 R /K 7 >>",
      },
      {
        num: 20,
        body: "<< /Nums [0 [8 0 R 9 0 R 10 0 R 9 0 R 9 0 R 11 0 R 14 0 R 15 0 R]] >>",
      },
    ],
    1,
  );
}

const opened: EditorDocument[] = [];

async function runTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  return page.runs.map((run) => run.text);
}

function runWith(texts: string[], fragment: string): string {
  const found = texts.find((text) => text.includes(fragment));
  if (found === undefined) throw new Error(`no run contains "${fragment}"`);
  return found;
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

describe("grouping text by structure block", () => {
  test("keeps each block's text in a run of its own", async () => {
    const texts = await runTexts(paragraphsPdf());
    expect(runWith(texts, "Introduction")).not.toContain("Read");
    expect(runWith(texts, "Second paragraph")).not.toContain("More text");
  });

  test("keeps inline elements in their block's run", async () => {
    const texts = await runTexts(paragraphsPdf());
    const paragraph = runWith(texts, "Read the");
    expect(paragraph).toContain("guide");
    expect(paragraph).toContain("for details.");
    expect(paragraph).toContain("More text.");
    expect(runWith(texts, "Item")).toContain("1.");
  });

  test("groups by geometry alone when the file has no structure tree", async () => {
    const texts = await runTexts(paragraphsPdf({ tagged: false }));
    const merged = runWith(texts, "Introduction");
    expect(merged).toContain("More text.");
    expect(merged).toContain("Second paragraph.");
  });
});

describe("textTag", () => {
  async function tagOf(bytes: Uint8Array, fragment: string) {
    const doc = await EditorDocument.open(bytes);
    opened.push(doc);
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    const run = page.runs.find((r) => r.text.includes(fragment))!;
    return textTag(doc, run.snapshot());
  }

  test("gives text the block it belongs to", async () => {
    const tagged = (role: string, cannotRetag: string | null) => ({
      kind: "tagged",
      block: { role, type: role },
      cannotRetag,
    });
    expect(await tagOf(paragraphsPdf(), "Introduction")).toEqual(
      tagged("H1", null),
    );
    expect(await tagOf(paragraphsPdf(), "guide")).toEqual(tagged("P", null));
    expect(await tagOf(paragraphsPdf(), "Item")).toEqual(
      tagged("LI", "not-text"),
    );
  });

  test("reads text in a file without a structure tree as untagged", async () => {
    expect(
      await tagOf(paragraphsPdf({ tagged: false }), "Introduction"),
    ).toEqual({ kind: "untagged", documentTagged: false, taggable: false });
  });
});

describe("containingBlock", () => {
  const block = (key: string, role: string): StructureBlock => ({
    key,
    ...structureRole(role),
  });
  const within = (parent: StructureBlock) => ({
    type: parent.type,
    block: parent,
  });
  const p = block("p", "P");
  const sect = block("sect", "Sect");

  test("puts an inline element in its parent's block", () => {
    expect(containingBlock(block("link", "Link"), within(p))).toBe(p);
  });

  test("makes an inline element placed directly in a grouping element its own block", () => {
    const code = block("code", "Code");
    expect(containingBlock(code, within(sect))).toBe(code);
  });

  test("keeps a block element its own block", () => {
    const h2 = block("h2", "H2");
    expect(containingBlock(h2, within(sect))).toBe(h2);
  });

  test("treats a custom role as a block that holds text", () => {
    const custom = block("custom", "Callout");
    expect(containingBlock(custom, within(p))).toBe(custom);
    expect(containingBlock(block("span", "Span"), within(custom))).toBe(custom);
  });
});

describe("structureRole", () => {
  test("gives a standard type its type, and a custom role none", () => {
    expect(structureRole("H3")).toEqual({ role: "H3", type: "H3" });
    expect(structureRole("Callout")).toEqual({ role: "Callout", type: null });
  });
});

describe("reading blocks from the file", () => {
  test("resolves nested inline elements to their block", async () => {
    const structure = (await readFileStructure(paragraphsPdf()))!.pages;
    const blocks = structure
      .get(0)!
      .elements.map((el) => [el.type, el.block.type, el.block.key]);
    expect(blocks).toEqual([
      ["H1", "H1", "8"],
      ["P", "P", "9"],
      ["Link", "P", "9"],
      ["P", "P", "11"],
      ["Lbl", "LI", "13"],
      ["LBody", "LI", "13"],
    ]);
  });

  test("reads a role the RoleMap leaves unmapped as custom", async () => {
    const bytes = buildClassicPdf(
      [
        {
          num: 1,
          body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R >>",
        },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /StructParents 0 >>",
        },
        {
          num: 6,
          body: "<< /Type /StructTreeRoot /K [7 0 R 8 0 R] /ParentTree 9 0 R /RoleMap << /Heading1 /H1 >> >>",
        },
        { num: 7, body: "<< /Type /StructElem /S /Heading1 /P 6 0 R /K 0 >>" },
        { num: 8, body: "<< /Type /StructElem /S /Callout /P 6 0 R /K 1 >>" },
        { num: 9, body: "<< /Nums [0 [7 0 R 8 0 R]] >>" },
      ],
      1,
    );
    const structure = (await readFileStructure(bytes))!.pages;
    expect(
      structure.get(0)!.elements.map(({ role, type }) => ({ role, type })),
    ).toEqual([
      { role: "H1", type: "H1" },
      { role: "Callout", type: null },
    ]);
  });

  test("ends a /P cycle at the top of the tree", async () => {
    const bytes = buildClassicPdf(
      [
        {
          num: 1,
          body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R >>",
        },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /StructParents 0 >>",
        },
        {
          num: 6,
          body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 9 0 R >>",
        },
        { num: 7, body: "<< /Type /StructElem /S /Span /P 8 0 R /K 0 >>" },
        { num: 8, body: "<< /Type /StructElem /S /Span /P 7 0 R /K 7 0 R >>" },
        { num: 9, body: "<< /Nums [0 [7 0 R]] >>" },
      ],
      1,
    );
    const structure = (await readFileStructure(bytes))!.pages;
    expect(structure.get(0)!.elements[0].block.type).toBe("Span");
  });
});

// As Chrome tags: each element's text inside a NonStruct, list bullets drawn
// outside any element or as artifacts, and one loose line with no tag at all.
const CHROME_CONTENT =
  "/NonStruct <</MCID 0>> BDC BT /F1 20 Tf 72 700 Td (Introduction) Tj ET EMC\n" +
  "/NonStruct <</MCID 1>> BDC BT /F1 12 Tf 72 670 Td (Body text.) Tj ET EMC\n" +
  "BT /F1 12 Tf 72 640 Td (\\267) Tj ET\n" +
  "/NonStruct <</MCID 2>> BDC BT /F1 12 Tf 84 640 Td (First item) Tj ET EMC\n" +
  "/Artifact BMC BT /F1 12 Tf 72 620 Td (\\267) Tj ET EMC\n" +
  "/NonStruct <</MCID 3>> BDC BT /F1 12 Tf 84 620 Td (Second item) Tj ET EMC\n" +
  "/Artifact BMC BT /F1 12 Tf 72 560 Td (\\267) Tj ET EMC\n" +
  "BT /F1 12 Tf 84 560 Td (Loose item) Tj ET\n";

function chromePdf(): Uint8Array {
  const element = (num: number, s: string, parent: number, k: string) => ({
    num,
    body: `<< /Type /StructElem /S /${s} /P ${parent} 0 R /Pg 3 0 R /K ${k} >>`,
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
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /StructParents 0 " +
          "/Resources << /Font << /F1 5 0 R >> >> >>",
      },
      { num: 4, body: streamBody("", CHROME_CONTENT) },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 6,
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 20 0 R /ParentTreeNextKey 1 >>",
      },
      element(7, "Document", 6, "[8 0 R 10 0 R 12 0 R]"),
      element(8, "H1", 7, "9 0 R"),
      element(9, "NonStruct", 8, "0"),
      element(10, "P", 7, "11 0 R"),
      element(11, "NonStruct", 10, "1"),
      element(12, "L", 7, "[13 0 R 15 0 R]"),
      element(13, "LI", 12, "14 0 R"),
      element(14, "NonStruct", 13, "2"),
      element(15, "LI", 12, "16 0 R"),
      element(16, "NonStruct", 15, "3"),
      { num: 20, body: "<< /Nums [0 [9 0 R 11 0 R 14 0 R 16 0 R]] >>" },
    ],
    1,
  );
}

describe("Chrome-style tagging", () => {
  async function openChrome() {
    const doc = await EditorDocument.open(chromePdf());
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    const run = (fragment: string) =>
      doc.page(0).runs.find((r) => r.text.includes(fragment))!;
    const tagOf = (fragment: string) => {
      const tag = textTag(doc, run(fragment).snapshot());
      return tag.kind === "tagged" ? tag.block.type : tag.kind;
    };
    return { doc, run, tagOf };
  }

  test("reads text inside a NonStruct as its parent's", async () => {
    const { doc, tagOf } = await openChrome();
    expect(tagOf("Introduction")).toBe("H1");
    expect(tagOf("Body text.")).toBe("P");
    expect(doc.headings()).toEqual([{ type: "H1", pageIndex: 0, mcids: [0] }]);
  });

  test("keeps a list bullet with its item, however the bullet is tagged", async () => {
    const { run, tagOf } = await openChrome();
    expect(run("First item").text).toContain("\u2022");
    expect(run("Second item").text).toContain("\u2022");
    expect(tagOf("First item")).toBe("LI");
    expect(tagOf("Second item")).toBe("LI");
  });

  test("retags the heading through the NonStruct holding its text", async () => {
    const { doc, run } = await openChrome();
    new HistoryStack().execute(
      new RetagTextCommand({
        pageIndex: 0,
        mcid: run("Introduction").snapshot().mcid!,
        type: "H2",
      }),
      doc,
    );
    const { blob } = await exportToBlob(doc, "chrome.pdf");
    const pdf = (await RawPdf.parse(new Uint8Array(await blob.arrayBuffer())))!;
    expect(pdf.dictName(pdf.objectBody(8)!, "S")).toBe("H2");
    expect(pdf.dictName(pdf.objectBody(9)!, "S")).toBe("NonStruct");
  });

  test("tags untagged text without tagging the artifact bullet beside it", async () => {
    const { doc, run } = await openChrome();
    const loose = run("Loose item");
    new HistoryStack().execute(
      new TagTextCommand({ pageIndex: 0, runId: loose.id, as: "P" }),
      doc,
    );
    const marks = collectMemberPtrs(loose).map((ptr) =>
      readTagMarks(doc.module, ptr).map((tag) => tag.name),
    );
    expect(marks).toEqual([["Artifact"], ["P"]]);
  });
});
