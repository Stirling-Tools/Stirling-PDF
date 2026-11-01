// @vitest-environment node
// jsdom's Blob cannot stream, so the repaired streams would not deflate or inflate.
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
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { parseOps } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { repairStructure } from "@editor/tools/pdfTextEditor/pdfdoc/passes/repairStructure";
import { RawPdf, arrayItems } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { copyTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  buildClassicPdf,
  streamBody,
  type FixtureObject,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const TAGGED_SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);

const PAGE = 3;
const P = 8;
const FIGURE = 9;

/**
 * One tagged page: P (element 8) owns MCID 0, Figure (element 9) owns MCID 1.
 * `content` is the page's content; `extra` adds or replaces objects.
 */
function taggedPdf(content: string | string[], extra: FixtureObject[] = []) {
  const streams = Array.isArray(content) ? content : [content];
  const contentRefs = streams.map((_, i) => `${20 + i} 0 R`).join(" ");
  const base: FixtureObject[] = [
    {
      num: 1,
      body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
    },
    { num: 2, body: `<< /Type /Pages /Kids [${PAGE} 0 R] /Count 1 >>` },
    {
      num: PAGE,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents [${contentRefs}] /StructParents 0 >>`,
    },
    {
      num: 5,
      body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 6 0 R /ParentTreeNextKey 1 >>",
    },
    { num: 6, body: `<< /Nums [0 [${P} 0 R ${FIGURE} 0 R]] >>` },
    {
      num: 7,
      body: `<< /Type /StructElem /S /Document /P 5 0 R /K [${P} 0 R ${FIGURE} 0 R] >>`,
    },
    {
      num: P,
      body: `<< /Type /StructElem /S /P /P 7 0 R /Pg ${PAGE} 0 R /K 0 >>`,
    },
    {
      num: FIGURE,
      body: `<< /Type /StructElem /S /Figure /P 7 0 R /Pg ${PAGE} 0 R /K 1 /Alt (A square) >>`,
    },
    ...streams.map((s, i) => ({ num: 20 + i, body: streamBody("", s) })),
  ];
  const replaced = new Set(extra.map((o) => o.num));
  return buildClassicPdf(
    [...base.filter((o) => !replaced.has(o.num)), ...extra],
    1,
  );
}

const WORD = (mcid: number, text: string) =>
  `/P <</MCID ${mcid}>> BDC BT /F1 12 Tf 10 10 Td (${text}) Tj ET EMC\n`;
const FIGURE_CONTENT = "/Figure <</MCID 1>> BDC 0 0 10 10 re f EMC\n";

/** `original` defaults to `bytes`: the same page before the edit, so nothing reads as deleted. */
async function repaired(
  bytes: Uint8Array,
  original: Uint8Array = bytes,
): Promise<RawPdf> {
  const out = await repairStructure(bytes, { pages: [0], original });
  expect(out).not.toBeNull();
  return (await RawPdf.parse(out!))!;
}

async function contentText(pdf: RawPdf): Promise<string> {
  return toLatin1((await pdf.pageContent(pdf.pageNumberAt(0)!))!);
}

/** MCIDs in content order, one per BDC. */
async function contentMcids(pdf: RawPdf): Promise<number[]> {
  return parseOps(await contentText(pdf))
    .filter((op) => op.op === "BDC")
    .flatMap((op) => {
      const m = op.operands.join(" ").match(/\/MCID (\d+)/);
      return m ? [Number(m[1])] : [];
    });
}

function kids(pdf: RawPdf, num: number): string {
  return pdf.valueSpan(pdf.objectBody(num)!, "K")!.text;
}

/** The /S of the element the page's ParentTree maps `mcid` to. */
function ownerType(pdf: RawPdf, mcid: number): string | null {
  const root = pdf.dictRef(pdf.objectBody(pdf.rootNum)!, "StructTreeRoot")!;
  const entry = pdf.numberTreeEntry(root, "ParentTree", 0)!.span.text;
  const ref = entry.match(/^(\d+) \d+ R$/);
  const list = ref ? pdf.objectBody(Number(ref[1]))!.trim() : entry;
  const owner = arrayItems(list)![mcid]?.text.match(/^(\d+) \d+ R$/);
  return owner ? pdf.dictName(pdf.objectBody(Number(owner[1]))!, "S") : null;
}

function parentArray(pdf: RawPdf): string {
  return pdf.numberTreeEntry(5, "ParentTree", 0)!.span.text;
}

describe("repairStructure: repeated MCIDs", () => {
  test("gives each repeat its own MCID, owned by the same element", async () => {
    const pdf = await repaired(
      taggedPdf(WORD(0, "Hello") + FIGURE_CONTENT + WORD(0, "world")),
    );
    expect(await contentMcids(pdf)).toEqual([0, 1, 2]);
    expect(kids(pdf, P)).toBe("[0 2]");
    expect(parentArray(pdf)).toBe(`[${P} 0 R ${FIGURE} 0 R ${P} 0 R]`);
  });

  test("keeps reading order by placing new MCIDs right after the original", async () => {
    const pdf = await repaired(
      taggedPdf(WORD(0, "a") + WORD(0, "b") + WORD(3, "c") + WORD(3, "d"), [
        {
          num: P,
          body: `<< /Type /StructElem /S /P /P 7 0 R /Pg ${PAGE} 0 R /K [0 3] >>`,
        },
        {
          num: 6,
          body: `<< /Nums [0 [${P} 0 R ${FIGURE} 0 R null ${P} 0 R]] >>`,
        },
      ]),
    );
    expect(await contentMcids(pdf)).toEqual([0, 4, 3, 5]);
    expect(kids(pdf, P)).toBe("[0 4 3 5]");
  });

  test("renumbers across the parts of a multi-stream page", async () => {
    const pdf = await repaired(
      taggedPdf([WORD(0, "first") + FIGURE_CONTENT, WORD(0, "appended")]),
    );
    expect(await contentMcids(pdf)).toEqual([0, 1, 2]);
  });

  test("writes an MCR for an element whose /Pg is another page", async () => {
    const pdf = await repaired(
      taggedPdf(WORD(0, "a") + WORD(0, "b"), [
        {
          num: P,
          body: `<< /Type /StructElem /S /P /P 7 0 R /Pg 99 0 R /K [<< /Type /MCR /Pg ${PAGE} 0 R /MCID 0 >>] >>`,
        },
      ]),
    );
    expect(kids(pdf, P)).toBe(
      `[<< /Type /MCR /Pg ${PAGE} 0 R /MCID 0 >> << /Type /MCR /Pg ${PAGE} 0 R /MCID 2 >>]`,
    );
  });

  test("changes nothing in the content but the MCID numbers", async () => {
    const before = WORD(0, "Hello (world)") + FIGURE_CONTENT + WORD(0, "again");
    const pdf = await repaired(taggedPdf(before));
    const mask = (s: string) => s.replace(/\/MCID \d+/g, "/MCID n");
    expect(mask(await contentText(pdf))).toBe(mask(`${before}\n`));
  });

  test("leaves repeats of an MCID no element owns alone", async () => {
    const bytes = taggedPdf(
      WORD(0, "a") + FIGURE_CONTENT + WORD(7, "b") + WORD(7, "c"),
    );
    expect(
      await repairStructure(bytes, { pages: [0], original: bytes }),
    ).toBeNull();
  });
});

/** Moves the page's MCIDs into named property lists, on the page or inherited from /Pages. */
function namedProperties(where: "page" | "inherited"): FixtureObject[] {
  const resources =
    "/Resources << /Properties << /MC0 << /MCID 0 >> /MC1 12 0 R >> >>";
  return [
    where === "page"
      ? {
          num: PAGE,
          body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents [20 0 R] /StructParents 0 ${resources} >>`,
        }
      : {
          num: 2,
          body: `<< /Type /Pages /Kids [${PAGE} 0 R] /Count 1 ${resources} >>`,
        },
    { num: 12, body: "<< /MCID 1 >>" },
  ];
}

const NAMED_WORD = "/P /MC0 BDC BT /F1 12 Tf 10 10 Td (kept) Tj ET EMC\n";
const NAMED_FIGURE = "/Figure /MC1 BDC 0 0 10 10 re f EMC\n";

describe("repairStructure: named property lists", () => {
  test.each(["page", "inherited"] as const)(
    "reads MCIDs named in the %s /Properties",
    async (where) => {
      const original = taggedPdf(
        NAMED_WORD + NAMED_FIGURE,
        namedProperties(where),
      );
      const pdf = await repaired(
        taggedPdf(
          NAMED_WORD + NAMED_FIGURE + WORD(0, "copy"),
          namedProperties(where),
        ),
        original,
      );
      expect(kids(pdf, FIGURE)).toBe("1");
      // The named occurrence keeps MCID 0; the inline repeat moves.
      expect(kids(pdf, P)).toBe("[0 2]");
      expect(parentArray(pdf)).toBe(`[${P} 0 R ${FIGURE} 0 R ${P} 0 R]`);
      expect(await contentMcids(pdf)).toEqual([2]);
    },
  );
});

describe("repairStructure: deleted content", () => {
  test("removes an MCID the page no longer has from its element and the ParentTree", async () => {
    const pdf = await repaired(
      taggedPdf(WORD(0, "only the text is left")),
      taggedPdf(WORD(0, "a") + FIGURE_CONTENT),
    );
    expect(kids(pdf, FIGURE)).toBe("[]");
    expect(parentArray(pdf)).toBe(`[${P} 0 R null]`);
    // The description belongs to the element, which survives.
    expect(pdf.objectBody(FIGURE)).toContain("/Alt (A square)");
  });

  test("never removes an MCID it could not read before the edit", async () => {
    // A name missing from /Properties is unreadable in both versions.
    const bytes = taggedPdf(
      WORD(0, "a") + "/Figure /Missing BDC 0 0 10 10 re f EMC\n",
    );
    expect(
      await repairStructure(bytes, { pages: [0], original: bytes }),
    ).toBeNull();
  });

  test("removes nothing without the original to compare against", async () => {
    expect(
      await repairStructure(taggedPdf(WORD(0, "only the text is left")), {
        pages: [0],
        original: new Uint8Array(0),
      }),
    ).toBeNull();
  });
});

describe("repairStructure: what it leaves alone", () => {
  test("returns null for a page whose tags are already sound", async () => {
    const bytes = taggedPdf(WORD(0, "a") + FIGURE_CONTENT);
    expect(
      await repairStructure(bytes, { pages: [0], original: bytes }),
    ).toBeNull();
  });

  test("returns null for an untagged file", async () => {
    const bytes = buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R >>",
        },
        { num: 4, body: streamBody("", WORD(0, "a") + WORD(0, "b")) },
      ],
      1,
    );
    const parse = vi.spyOn(RawPdf, "parse");
    expect(
      await repairStructure(bytes, { pages: [0], original: bytes }),
    ).toBeNull();
    // The original is only needed for a tagged file.
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
  });

  test("only looks at the pages it is given", async () => {
    const bytes = taggedPdf(WORD(0, "a") + WORD(0, "b"));
    expect(
      await repairStructure(bytes, { pages: [], original: bytes }),
    ).toBeNull();
  });
});

describe("repairStructure on the editor's own output", () => {
  const opened: EditorDocument[] = [];

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

  function newText(doc: EditorDocument, text: string, x: number): number {
    const m = doc.module;
    const ptr = m.FPDFPageObj_NewTextObj(doc.docPtr, "Helvetica", 14);
    const wide = m.pdfium.wasmExports.malloc((text.length + 1) * 2);
    m.pdfium.stringToUTF16(text, wide, (text.length + 1) * 2);
    m.FPDFText_SetText(ptr, wide);
    m.pdfium.wasmExports.free(wide);
    m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, x, 600);
    return ptr;
  }

  function objectsWithMcid(
    m: WrappedPdfiumModule,
    pagePtr: number,
    id: number,
  ) {
    const out: number[] = [];
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetMarkedContentID(obj) === id) out.push(obj);
    }
    return out;
  }

  test("a paragraph re-emitted word by word saves as one MCID per sequence", async () => {
    const doc = await EditorDocument.open(
      new Uint8Array(await readFile(TAGGED_SAMPLE)),
    );
    opened.push(doc);
    const m = doc.module;
    const page = doc.page(0);
    // The way emitTextLine re-emits an edited run: one object per word, each
    // given the original's tags, so PDFium writes each as its own sequence.
    const [first, ...rest] = objectsWithMcid(m, page.pagePtr, 1);
    for (const [i, word] of ["Revenue", "grew", "fast"].entries()) {
      const ptr = newText(doc, word, 72 + i * 80);
      copyTagMarks(m, doc.docPtr, first, ptr);
      m.FPDFPage_InsertObject(page.pagePtr, ptr);
    }
    for (const old of [first, ...rest]) {
      m.FPDFPage_RemoveObject(page.pagePtr, old);
      m.FPDFPageObj_Destroy(old);
    }
    page.markDirty();
    page.markNeedsGenerate();

    const { blob } = await exportToBlob(doc, "sample.pdf");
    const pdf = (await RawPdf.parse(new Uint8Array(await blob.arrayBuffer())))!;
    const mcids = await contentMcids(pdf);
    expect(new Set(mcids).size).toBe(mcids.length);

    const reopened = await EditorDocument.open(
      new Uint8Array(await blob.arrayBuffer()),
    );
    opened.push(reopened);
    const paragraph = reopened
      .structure(0)
      .elements.find((e) => e.type === "P")!;
    expect(paragraph.mcids).toHaveLength(3);
    expect(paragraph.mcids[0]).toBe(1);
    // A reader finds the element for content through the ParentTree.
    for (const mcid of paragraph.mcids) {
      expect(ownerType(pdf, mcid)).toBe("P");
    }
  });

  test("editing one paragraph leaves the page's named-form tags alone", async () => {
    // Elements 8 (edited P, MCID 0), 10 (untouched P, MCID 1) and 9 (Figure, MCID 2),
    // every MCID held in a named property list.
    const bytes = buildClassicPdf(
      [
        {
          num: 1,
          body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
        },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body:
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 20 0 R /StructParents 0 " +
            "/Resources << /Font << /F1 4 0 R >> /Properties << /MC0 << /MCID 0 >> /MC1 << /MCID 1 >> /MC2 << /MCID 2 >> >> >> >>",
        },
        {
          num: 4,
          body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        },
        {
          num: 5,
          body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 6 0 R /ParentTreeNextKey 1 >>",
        },
        { num: 6, body: "<< /Nums [0 [8 0 R 10 0 R 9 0 R]] >>" },
        {
          num: 7,
          body: "<< /Type /StructElem /S /Document /P 5 0 R /K [8 0 R 10 0 R 9 0 R] >>",
        },
        {
          num: 8,
          body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>",
        },
        {
          num: 9,
          body: "<< /Type /StructElem /S /Figure /P 7 0 R /Pg 3 0 R /K 2 /Alt (A square) >>",
        },
        {
          num: 10,
          body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 1 >>",
        },
        {
          num: 20,
          body: streamBody(
            "",
            "/P /MC0 BDC BT /F1 14 Tf 72 700 Td (Edited paragraph) Tj ET EMC\n" +
              "/P /MC1 BDC BT /F1 14 Tf 72 650 Td (Untouched paragraph) Tj ET EMC\n" +
              "/Figure /MC2 BDC 72 500 50 50 re f EMC\n",
          ),
        },
      ],
      1,
    );
    const doc = await EditorDocument.open(bytes);
    opened.push(doc);
    const m = doc.module;
    const page = doc.page(0);
    const [old] = objectsWithMcid(m, page.pagePtr, 0);
    for (const [i, word] of ["Edited", "again"].entries()) {
      const ptr = newText(doc, word, 72 + i * 80);
      copyTagMarks(m, doc.docPtr, old, ptr);
      m.FPDFPage_InsertObject(page.pagePtr, ptr);
    }
    m.FPDFPage_RemoveObject(page.pagePtr, old);
    m.FPDFPageObj_Destroy(old);
    page.markDirty();
    page.markNeedsGenerate();

    const { blob } = await exportToBlob(doc, "named.pdf");
    const pdf = (await RawPdf.parse(new Uint8Array(await blob.arrayBuffer())))!;
    // PDFium writes the untouched sequences back in named form.
    expect(await contentText(pdf)).toContain("/MC1 BDC");
    expect(kids(pdf, 10)).toBe("1");
    expect(kids(pdf, 9)).toBe("2");
    expect(ownerType(pdf, 1)).toBe("P");
    expect(ownerType(pdf, 2)).toBe("Figure");
    expect(kids(pdf, 8)).toMatch(/^\[0 \d+\]$/);
  });
});
