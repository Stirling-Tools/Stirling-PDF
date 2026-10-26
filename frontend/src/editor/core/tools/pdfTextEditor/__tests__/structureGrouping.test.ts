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
    const tagged = (role: string) => ({
      kind: "tagged",
      block: { role, type: role },
    });
    expect(await tagOf(paragraphsPdf(), "Introduction")).toEqual(tagged("H1"));
    expect(await tagOf(paragraphsPdf(), "guide")).toEqual(tagged("P"));
    expect(await tagOf(paragraphsPdf(), "Item")).toEqual(tagged("LI"));
  });

  test("reads text in a file without a structure tree as untagged", async () => {
    expect(
      await tagOf(paragraphsPdf({ tagged: false }), "Introduction"),
    ).toEqual({ kind: "untagged", documentTagged: false });
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
