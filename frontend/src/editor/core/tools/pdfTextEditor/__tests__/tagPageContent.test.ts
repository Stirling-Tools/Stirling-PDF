// @vitest-environment node
// jsdom's Blob cannot stream, so a saved object stream would not inflate.
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
import {
  TagPageContentCommand,
  hasUntaggedContent,
} from "@editor/tools/pdfTextEditor/commands/TagPageContentCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { tagAllPages } from "@editor/tools/pdfTextEditor/hooks/useBulkTagging";
import { readAllPagesInBackground } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import {
  markNamesOf,
  readTagMarks,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { setTextTagCommand } from "@editor/tools/pdfTextEditor/hooks/useTextAccessibility";
import { matchingRuns } from "@editor/tools/pdfTextEditor/util/pageFurniture";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import { imageAccessibility } from "@editor/tools/pdfTextEditor/util/imageAccessibility";
import {
  buildClassicPdf,
  streamBody,
  type FixtureObject,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// Two columns, the right one drawn first, then a rule and an image.
const COLUMNS =
  "BT /F1 12 Tf 320 700 Td (Right column opens here.) Tj ET\n" +
  "BT /F1 12 Tf 320 686 Td (Right column goes on.) Tj ET\n" +
  "BT /F1 12 Tf 72 700 Td (Left column opens here.) Tj ET\n" +
  "BT /F1 12 Tf 72 686 Td (Left column goes on.) Tj ET\n" +
  "72 640 m 540 640 l S\n" +
  "q 50 0 0 50 72 560 cm /Im1 Do Q\n";

function pagePdf(content: string, catalog = "", page = ""): Uint8Array {
  const objects: FixtureObject[] = [
    { num: 1, body: `<< /Type /Catalog /Pages 2 0 R${catalog} >>` },
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      num: 3,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R${page} ` +
        "/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>",
    },
    { num: 4, body: streamBody("", content) },
    {
      num: 5,
      body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    },
    {
      num: 6,
      body: streamBody(
        "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
        "\x80",
      ),
    },
  ];
  return buildClassicPdf(objects, 1);
}

/** A tagged page: an H1 drawn first, then the untagged columns. */
function partlyTaggedPdf(): Uint8Array {
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R /MarkInfo << /Marked true >> >>",
      },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /StructParents 0 " +
          "/Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody(
          "",
          "/H1 <</MCID 0>> BDC BT /F1 20 Tf 72 740 Td (Report) Tj ET EMC\n" +
            COLUMNS,
        ),
      },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 6,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\x80",
        ),
      },
      {
        num: 7,
        body: "<< /Type /StructTreeRoot /K 8 0 R /ParentTree << /Nums [0 [9 0 R]] >> /ParentTreeNextKey 1 >>",
      },
      {
        num: 8,
        body: "<< /Type /StructElem /S /Document /P 7 0 R /K [9 0 R] >>",
      },
      {
        num: 9,
        body: "<< /Type /StructElem /S /H1 /P 8 0 R /Pg 3 0 R /K 0 >>",
      },
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
  const blob = await exportToBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

/** The saved file's blocks in reading order, each as its text or its type. */
async function savedReading(bytes: Uint8Array): Promise<string[]> {
  const structure = await readFileStructure(bytes);
  const doc = await open(bytes);
  const textOf = new Map<number, string>();
  for (const run of doc.page(0).runs) {
    const { mcid } = run.snapshot();
    if (mcid !== undefined) textOf.set(mcid, run.text.replace(/\s+/g, " "));
  }
  return structure!.blocks
    .filter((block) => block.type !== "Document")
    .map((block) => {
      const text = block.mcids.map((mcid) => textOf.get(mcid)).join(" ");
      return `${block.type}: ${text}`.trim();
    });
}

/** Every page-level object's marks, by type: 1 text, 2 path, 3 image. */
function marksByType(doc: EditorDocument): Map<number, string[][]> {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const byType = new Map<number, string[][]>();
  for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
    const ptr = m.FPDFPage_GetObject(pagePtr, i);
    const type = m.FPDFPageObj_GetType(ptr);
    const names = readTagMarks(m, ptr).map((tag) => tag.name);
    byType.set(type, [...(byType.get(type) ?? []), names]);
  }
  return byType;
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

describe("TagPageContentCommand", () => {
  test("tags text as P and images as Figure in content order, and the rest as artifacts", async () => {
    const doc = await open(pagePdf(COLUMNS));
    expect(hasUntaggedContent(doc, 0)).toBe(true);
    new HistoryStack().execute(
      new TagPageContentCommand({ pageIndex: 0 }),
      doc,
    );
    expect(hasUntaggedContent(doc, 0)).toBe(false);

    const bytes = await savedBytes(doc);
    expect(await savedReading(bytes)).toEqual([
      "P: Right column opens here. Right column goes on.",
      "P: Left column opens here. Left column goes on.",
      "Figure:",
    ]);
    const reopened = await open(bytes);
    expect(marksByType(reopened).get(2)).toEqual([["Artifact"]]);
    for (const run of reopened.page(0).runs) {
      expect(textTag(reopened, run.snapshot()).kind).toBe("tagged");
    }
  });

  test("puts the new elements around the page's tagged content as its content orders them", async () => {
    const doc = await open(partlyTaggedPdf());
    new HistoryStack().execute(
      new TagPageContentCommand({ pageIndex: 0 }),
      doc,
    );
    expect(await savedReading(await savedBytes(doc))).toEqual([
      "H1: Report",
      "P: Right column opens here. Right column goes on.",
      "P: Left column opens here. Left column goes on.",
      "Figure:",
    ]);
  });

  test("retags content marked with MCIDs the file has no tree for", async () => {
    const stale = COLUMNS.split("\n")
      .filter(Boolean)
      .map((line, i) => `/P <</MCID ${i}>> BDC ${line} EMC`)
      .join("\n");
    const doc = await open(pagePdf(stale, "", " /StructParents 0"));
    new HistoryStack().execute(
      new TagPageContentCommand({ pageIndex: 0 }),
      doc,
    );

    const bytes = await savedBytes(doc);
    expect(await savedReading(bytes)).toEqual([
      "P: Right column opens here. Right column goes on.",
      "P: Left column opens here. Left column goes on.",
      "Figure:",
    ]);
    const reopened = await open(bytes);
    expect(marksByType(reopened).get(2)).toEqual([["Artifact"]]);
  });

  test("undoes every tag, and redoes them", async () => {
    const doc = await open(pagePdf(COLUMNS));
    const history = new HistoryStack();
    history.execute(new TagPageContentCommand({ pageIndex: 0 }), doc);
    const tagged = doc.structureEdits();

    history.undo(doc);
    expect(doc.structureEdits()).toEqual([]);
    for (const marks of marksByType(doc).values()) {
      for (const names of marks) expect(names).toEqual([]);
    }
    for (const run of doc.page(0).runs) {
      expect(textTag(doc, run.snapshot()).kind).toBe("untagged");
    }

    history.redo(doc);
    expect(doc.structureEdits()).toEqual(tagged);
  });

  test("refuses a page whose structure the save cannot write", async () => {
    const doc = await open(
      pagePdf(COLUMNS, " /StructTreeRoot 7 0 R", " /StructParents 0"),
    );
    expect(hasUntaggedContent(doc, 0)).toBe(false);
    expect(() =>
      new HistoryStack().execute(
        new TagPageContentCommand({ pageIndex: 0 }),
        doc,
      ),
    ).toThrow();
  });
});

/** A store holding `bytes` as its document, its pages listed but none read. */
async function storeFor(bytes: Uint8Array): Promise<EditorStore> {
  const doc = await EditorDocument.open(bytes);
  const store = new EditorStore();
  await store.setDocument(doc);
  store.publishPages(
    Array.from(
      { length: doc.pageCount },
      (_, pageIndex) =>
        ({
          pageIndex,
          revision: -1,
          runs: [],
          images: [],
          shapes: [],
          annotations: [],
          rules: [],
        }) as unknown as PageSnapshot,
    ),
  );
  return store;
}

describe("tagAllPages", () => {
  test("reads and tags every page behind the loading overlay, as one undo step", async () => {
    const store = await storeFor(pagePdf(COLUMNS));
    const progress = vi.spyOn(store, "setProgress");
    const tagging = tagAllPages(store);
    expect(store.getState().loading).toBe(true);
    await tagging;

    expect(store.getState().loading).toBe(false);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ current: 0, total: 2 }),
    );
    const doc = store.document!;
    expect(hasUntaggedContent(doc, 0)).toBe(false);
    expect(
      store.getState().pages[0].runs.every((run) => run.mcid !== undefined),
    ).toBe(true);

    store.undo();
    expect(hasUntaggedContent(doc, 0)).toBe(true);
    expect(store.history.canUndo).toBe(false);
    store.dispose();
  });

  test("tags text set larger or bolder than the body as headings, levelled by style, even set tight on its paragraph", async () => {
    const show = (font: string, size: number, y: number, text: string) =>
      `BT /${font} ${size} Tf 72 ${y} Td (${text}) Tj ET`;
    const body =
      "Sales rose in every region over the quarter, led by the north";
    const store = await storeFor(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
          {
            num: 3,
            body:
              "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
              "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
          },
          {
            num: 4,
            body: streamBody(
              "",
              [
                show("F1", 24, 720, "Quarterly report"),
                show("F2", 11, 660, "Results"),
                show("F1", 11, 646, body),
                show("F2", 11, 600, "Outlook"),
                show("F1", 11, 586, body.replace("north", "south")),
              ].join("\n"),
            ),
          },
          {
            num: 5,
            body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
          },
          {
            num: 6,
            body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
          },
        ],
        1,
      ),
    );
    await tagAllPages(store);
    expect(tagsShown(store.document!, 0)).toEqual(
      new Map([
        ["Quarterly report", "H1"],
        ["Results", "H2"],
        [body, "P"],
        ["Outlook", "H2"],
        [body.replace("north", "south"), "P"],
      ]),
    );
    store.dispose();
  });

  test("never skips a heading level in the order the structure tree reads, which is drawing order", async () => {
    const show = (font: string, size: number, y: number, text: string) =>
      `BT /${font} ${size} Tf 72 ${y} Td (${text}) Tj ET`;
    const body =
      "Sales rose in every region over the quarter, led by the north";
    const store = await storeFor(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
          {
            num: 3,
            body:
              "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
              "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
          },
          {
            num: 4,
            body: streamBody(
              "",
              [
                show("F2", 11, 660, "Results"),
                show("F1", 24, 720, "Quarterly report"),
                show("F1", 11, 646, body),
                show("F2", 11, 600, "Outlook"),
                show("F1", 11, 586, body.replace("north", "south")),
              ].join("\n"),
            ),
          },
          {
            num: 5,
            body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
          },
          {
            num: 6,
            body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
          },
        ],
        1,
      ),
    );
    await tagAllPages(store);
    const shown = tagsShown(store.document!, 0);
    expect(
      ["Results", "Quarterly report", "Outlook"].map((text) => shown.get(text)),
    ).toEqual(["H1", "H1", "H2"]);
    store.dispose();
  });

  test("caps heading levels across pages, and undoes and redoes them as one step", async () => {
    const store = await storeFor(
      linesPdf([
        [line("F2", 11, 720, "Summary"), line("F1", 11, 700, BODY_LINE)],
        [
          line("F1", 24, 720, "Annual report"),
          line("F2", 11, 660, "Outlook"),
          line("F1", 11, 640, BODY_LINE),
        ],
      ]),
    );
    const doc = store.document!;
    await tagAllPages(store);
    const levels = () => [
      tagsShown(doc, 0).get("Summary"),
      tagsShown(doc, 1).get("Annual report"),
      tagsShown(doc, 1).get("Outlook"),
    ];
    expect(levels()).toEqual(["H1", "H1", "H2"]);

    store.undo();
    expect(hasUntaggedContent(doc, 1)).toBe(true);
    store.redo();
    expect(levels()).toEqual(["H1", "H1", "H2"]);
    store.dispose();
  });

  test("keeps paragraphs on a tagged page, and guesses headings on the untagged ones", async () => {
    const store = await storeFor(
      linesPdf([
        [line("F1", 11, 700, BODY_LINE)],
        [
          line("F1", 24, 720, "Annual report"),
          line("F2", 11, 660, "Outlook"),
          line("F1", 11, 640, BODY_LINE),
        ],
      ]),
    );
    const doc = store.document!;
    PdfiumTextReader.populate(doc, doc.page(0));
    store.history.execute(new TagPageContentCommand({ pageIndex: 0 }), doc);
    await tagAllPages(store);
    expect(new Set(tagsShown(doc, 0).values())).toEqual(new Set(["P"]));
    expect(tagsShown(doc, 1).get("Annual report")).toBe("H1");
    store.dispose();
  });

  test("tags runs one marked-content sequence draws as one element, and undoes it", async () => {
    // PDFium gives both objects one mark list, so they can carry only one tag.
    const store = await storeFor(
      pagePdf(
        "/TD <</MCID 7>> BDC BT /F1 12 Tf 72 700 Td (Region) Tj 60 0 Td (North) Tj ET EMC\n",
      ),
    );
    await tagAllPages(store);

    expect(store.getState().error).toBeNull();
    const doc = store.document!;
    const runs = doc.page(0).runs;
    expect(runs).toHaveLength(2);
    const [first, second] = runs.map((run) => run.tagMarks);
    expect(first).toEqual([{ name: "P", mcid: expect.any(Number) }]);
    expect(second).toEqual(first);
    expect(marksByType(doc).get(1)).toEqual([["P"], ["P"]]);

    store.undo();
    expect(marksByType(doc).get(1)).toEqual([["TD"], ["TD"]]);
    store.dispose();
  });

  test("adds one tag to a shared untagged sequence, not one per run", async () => {
    const store = await storeFor(
      pagePdf(
        "/Span <</Lang (en)>> BDC BT /F1 12 Tf 72 700 Td (Region) Tj 60 0 Td (North) Tj ET EMC\n",
      ),
    );
    await tagAllPages(store);

    expect(store.getState().error).toBeNull();
    const doc = store.document!;
    const m = doc.module;
    const pagePtr = doc.page(0).pagePtr;
    const names = Array.from(
      { length: m.FPDFPage_CountObjects(pagePtr) },
      (_, i) => markNamesOf(m, m.FPDFPage_GetObject(pagePtr, i)),
    );
    expect(names).toEqual([
      ["Span", "P"],
      ["Span", "P"],
    ]);
    store.dispose();
  });

  test("records nothing when nothing is untagged", async () => {
    const store = await storeFor(pagePdf(COLUMNS));
    await tagAllPages(store);
    const tagged = store.history.peekUndo();
    await tagAllPages(store);
    expect(store.history.peekUndo()).toBe(tagged);
    store.dispose();
  });
});

/**
 * What the watermark tool appends to a page on its default settings: a
 * half-opaque light grey grid of the text, or of the image 30 points high,
 * spaced 50 points apart.
 */
function toolWatermark(kind: "text" | "image"): string {
  const grid =
    kind === "text"
      ? Array.from({ length: 14 * 9 }, (_, n) => {
          const [x, y] = [(n % 9) * 86, Math.floor(n / 9) * 62];
          return `BT /F1 12 Tf 1 0 0 1 ${x} ${y} Tm (DRAFT) Tj 0 -12 Td ET`;
        })
      : Array.from({ length: 10 * 8 }, (_, n) => {
          const [x, y] = [(n % 8) * 80, Math.floor(n / 8) * 80];
          return `q 30 0 0 30 ${x} ${y} cm /Im1 Do Q`;
        });
  return ["/GS0 gs 0.827 0.827 0.827 rg", ...grid].join("\n");
}

/**
 * `count` untagged pages, each with a running header, footer and page number
 * around its own text, and the watermark tool's output over it all when
 * `watermark` says which.
 */
function furnishedPdf(count: number, watermark?: "text" | "image"): Uint8Array {
  const show = (x: number, y: number, text: string) =>
    `BT /F1 10 Tf ${x} ${y} Td (${text}) Tj ET`;
  const pages = Array.from({ length: count }, (_, i) => ({
    page: 10 + 2 * i,
    content: [
      "q",
      show(72, 760, "Acme Corp | Q3 report"),
      show(72, 400, `Results for region ${String.fromCharCode(65 + i)}`),
      show(72, 70, "Confidential"),
      show(300, 30, `Page ${i + 1}`),
      "Q",
      ...(watermark ? [toolWatermark(watermark)] : []),
    ].join("\n"),
  }));
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      {
        num: 2,
        body: `<< /Type /Pages /Kids [${pages.map((p) => `${p.page} 0 R`).join(" ")}] /Count ${count} >>`,
      },
      {
        num: 3,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 4,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\x80",
        ),
      },
      ...pages.flatMap(({ page, content }) => [
        {
          num: page,
          body:
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${page + 1} 0 R ` +
            "/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> " +
            "/ExtGState << /GS0 << /ca 0.5 >> >> >> >>",
        },
        { num: page + 1, body: streamBody("", content) },
      ]),
    ],
    1,
  );
}

/** How each run on the page is tagged, by its text. */
const BODY_LINE =
  "Sales rose in every region over the quarter, led by the north";

/** Text drawn in a font of `linesPdf`'s: F1 Helvetica, F2 Helvetica-Bold. */
function line(font: "F1" | "F2", size: number, y: number, text: string) {
  return `BT /${font} ${size} Tf 72 ${y} Td (${text}) Tj ET`;
}

/** A PDF of Letter pages, each drawing its `line`s in order. */
function linesPdf(pages: readonly string[][]): Uint8Array {
  const fonts = 3 + pages.length * 2;
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      {
        num: 2,
        body: `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
      },
      ...pages.flatMap((lines, i) => [
        {
          num: 3 + i * 2,
          body:
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R ` +
            `/Resources << /Font << /F1 ${fonts} 0 R /F2 ${fonts + 1} 0 R >> >> >>`,
        },
        { num: 4 + i * 2, body: streamBody("", lines.join("\n")) },
      ]),
      {
        num: fonts,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: fonts + 1,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      },
    ],
    1,
  );
}

function tagsShown(doc: EditorDocument, pageIndex: number) {
  return new Map(
    doc.page(pageIndex).runs.map((run) => {
      const tag = textTag(doc, run.snapshot());
      const shown =
        tag.kind === "artifact"
          ? (tag.furniture ?? "artifact")
          : tag.kind === "tagged"
            ? tag.block.type
            : tag.kind;
      return [run.text.trim(), shown];
    }),
  );
}

describe("page furniture", () => {
  test("auto-tag makes repeated headers, footers and page numbers artifacts", async () => {
    const store = await storeFor(furnishedPdf(3));
    await tagAllPages(store);
    const doc = store.document!;
    expect(tagsShown(doc, 2)).toEqual(
      new Map([
        ["Acme Corp | Q3 report", "Header"],
        ["Results for region C", "P"],
        ["Confidential", "Footer"],
        ["Page 3", "PageNum"],
      ]),
    );
    const saved = (await RawPdf.parse(await savedBytes(doc)))!;
    const content = toLatin1(
      (await saved.pageContent(saved.pageNumberAt(2)!))!,
    );
    expect(content).toContain(
      "/Artifact <</Subtype/PageNum/Type/Pagination>> BDC",
    );

    store.undo();
    expect(tagsShown(doc, 2).get("Page 3")).toBe("untagged");
    store.dispose();
  });

  test("auto-tag makes the watermark tool's text an artifact, leaving the furniture under it", async () => {
    const store = await storeFor(furnishedPdf(2, "text"));
    await tagAllPages(store);
    const doc = store.document!;
    const drafts = doc
      .page(1)
      .runs.filter((run) => run.text.trim() === "DRAFT")
      .map((run) => textTag(doc, run.snapshot()));
    expect(drafts).toHaveLength(14 * 9);
    expect(
      drafts.every(
        (tag) => tag.kind === "artifact" && tag.furniture === "Watermark",
      ),
    ).toBe(true);
    const others = tagsShown(doc, 1);
    others.delete("DRAFT");
    expect(others).toEqual(
      new Map([
        ["Acme Corp | Q3 report", "Header"],
        ["Results for region B", "P"],
        ["Confidential", "Footer"],
        ["Page 2", "PageNum"],
      ]),
    );
    const saved = (await RawPdf.parse(await savedBytes(doc)))!;
    const content = toLatin1(
      (await saved.pageContent(saved.pageNumberAt(1)!))!,
    );
    expect(content).toContain(
      "/Artifact <</Subtype/Watermark/Type/Pagination>> BDC",
    );
    store.dispose();
  });

  test("auto-tag makes the watermark tool's images artifacts, not figures", async () => {
    const store = await storeFor(furnishedPdf(2, "image"));
    await tagAllPages(store);
    const images = store.document!.page(0).images;
    expect(images).toHaveLength(10 * 8);
    expect(images.every((image) => image.artifact && image.mcid === null)).toBe(
      true,
    );

    store.undo();
    expect(images.every((image) => !image.artifact)).toBe(true);
    store.dispose();
  });

  test("gives matching text on other pages an artifact's kind, as one undo step", async () => {
    const doc = await open(furnishedPdf(3));
    for (const pageIndex of [1, 2]) {
      PdfiumTextReader.populate(doc, doc.page(pageIndex));
    }
    const pages = [0, 1, 2].map((pageIndex) => {
      const { display, runs } = doc.page(pageIndex);
      return { pageIndex, display, runs: runs.map((r) => r.snapshot()) };
    });
    const footer = pages[0].runs.find((r) => r.text.includes("Confidential"))!;
    const targets = [
      footer,
      ...matchingRuns(pages, 0, footer).map(({ run }) => run),
    ].map((run) => ({ run, tag: textTag(doc, run) }));
    expect(targets).toHaveLength(3);
    const history = new HistoryStack();
    history.execute(
      setTextTagCommand(doc, targets, { artifact: "Footer" })!,
      doc,
    );
    expect([0, 1, 2].map((i) => tagsShown(doc, i).get("Confidential"))).toEqual(
      ["Footer", "Footer", "Footer"],
    );

    history.undo(doc);
    expect([0, 1, 2].map((i) => tagsShown(doc, i).get("Confidential"))).toEqual(
      ["untagged", "untagged", "untagged"],
    );
  });
});

describe("tagging text marked for no element", () => {
  test("tags it from the card, dropping the stale mark, and undoes back to it", async () => {
    // As a page merged in without its file's structure tree is.
    const doc = await open(
      pagePdf("/P <</MCID 7>> BDC BT /F1 12 Tf 72 700 Td (Orphan) Tj ET EMC\n"),
    );
    const run = doc.page(0).runs[0].snapshot();
    const tag = textTag(doc, run);
    expect(tag).toMatchObject({ kind: "untagged", taggable: true });

    const history = new HistoryStack();
    history.execute(setTextTagCommand(doc, [{ run, tag }], "H1")!, doc);
    expect(marksByType(doc).get(1)).toEqual([["H1"]]);
    expect(doc.structure(0).addedElements()).toHaveLength(1);

    history.undo(doc);
    expect(marksByType(doc).get(1)).toEqual([["P"]]);
    expect(doc.structure(0).addedElements()).toEqual([]);
  });
});

/**
 * Two pages as a merge leaves them: the second keeps its marked content and its
 * /StructParents 0 from a file whose tree was not carried over, and the merged
 * file has no tree.
 */
function mergedPdf({ link = false } = {}): Uint8Array {
  const page = (num: number, contents: number, extra = "") => ({
    num,
    body:
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R${extra} ` +
      "/Resources << /Font << /F1 7 0 R >> >> >>",
  });
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>" },
      page(3, 5),
      page(4, 6, ` /StructParents 0${link ? " /Annots [8 0 R]" : ""}`),
      {
        num: 5,
        body: streamBody("", "BT /F1 12 Tf 72 700 Td (First page.) Tj ET\n"),
      },
      {
        num: 6,
        body: streamBody(
          "",
          "/P <</MCID 0>> BDC BT /F1 12 Tf 72 700 Td (Merged page.) Tj ET EMC\n",
        ),
      },
      {
        num: 7,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      // Its /StructParent is the key its own file gave it, which the save hands a page.
      {
        num: 8,
        body: "<< /Type /Annot /Subtype /Link /Rect [72 690 160 712] /StructParent 1 /A << /S /URI /URI (https://example.com) >> >>",
      },
    ],
    1,
  );
}

describe("a merged page whose tree was not carried over", () => {
  async function tagPage(bytes: Uint8Array, pageIndex: number) {
    const doc = await EditorDocument.open(bytes);
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(pageIndex));
    new TagPageContentCommand({ pageIndex }).apply(doc);
    return savedBytes(doc);
  }

  test("stays taggable once another page's tags are saved, and gets a key of its own", async () => {
    const firstSaved = await tagPage(mergedPdf(), 0);
    const reopened = await EditorDocument.open(firstSaved);
    opened.push(reopened);
    expect(reopened.structure(1).cannotAddElement()).toBeNull();

    const bothSaved = await tagPage(firstSaved, 1);
    const structure = await readFileStructure(bothSaved);
    const pdf = (await RawPdf.parse(bothSaved))!;
    const keys = [0, 1].map((pageIndex) =>
      pdf.dictInt(
        pdf.objectBody(pdf.pageNumberAt(pageIndex)!)!,
        "StructParents",
      ),
    );
    expect(keys[0]).not.toBeNull();
    expect(keys[1]).not.toBeNull();
    expect(keys[1]).not.toBe(keys[0]);
    expect(structure!.pages.get(0)?.elements).toHaveLength(1);
    expect(structure!.pages.get(1)?.elements).toHaveLength(1);
    expect(structure!.pages.get(1)?.slotCount).not.toBeNull();
  });

  test("tags a link whose stale /StructParent the save has given to a page, and saves", async () => {
    const store = await storeFor(mergedPdf({ link: true }));
    await tagAllPages(store);
    expect(store.getState().error).toBeNull();
    const saved = await savedBytes(store.document!);
    const reopened = await EditorDocument.open(saved);
    opened.push(reopened);
    const [link] = reopened.structure(1).links();
    expect(link?.holder).not.toBeNull();
    store.dispose();
  });
});

describe("a sequence shared by a page number and text, tagged automatically", () => {
  const SHARED =
    "/P <</MCID 7>> BDC BT /F1 12 Tf 72 40 Td (3) Tj 60 0 Td (Confidential) Tj ET EMC\n";

  test("tags it as the text, not as the page number reached first", async () => {
    const doc = await open(pagePdf(SHARED));
    const [pageNumber, notice] = doc.page(0).runs;
    const history = new HistoryStack();
    history.execute(
      new TagPageContentCommand({
        pageIndex: 0,
        furniture: new Map([[pageNumber.id, "PageNum"]]),
        headings: new Map([[notice.id, "H2"]]),
      }),
      doc,
    );

    expect(marksByType(doc).get(1)).toEqual([["H2"], ["H2"]]);
    expect(doc.structure(0).addedElements()).toHaveLength(1);

    history.undo(doc);
    expect(marksByType(doc).get(1)).toEqual([["P"], ["P"]]);
    expect(doc.structure(0).addedElements()).toEqual([]);
  });
});

describe("content sharing one marked-content sequence, tagged from the card", () => {
  const SHARED =
    "/P <</MCID 7>> BDC BT /F1 12 Tf 72 700 Td (Region) Tj 60 0 Td (North) Tj ET EMC\n";

  test("tags every run on the sequence together, and undoes them together", async () => {
    const doc = await open(pagePdf(SHARED));
    const [region, north] = doc.page(0).runs.map((r) => r.snapshot());
    const history = new HistoryStack();
    history.execute(
      setTextTagCommand(
        doc,
        [{ run: region, tag: textTag(doc, region) }],
        "H1",
      )!,
      doc,
    );
    const [first, second] = doc.page(0).runs;
    expect(first.tagMarks).toEqual([{ name: "H1", mcid: expect.any(Number) }]);
    expect(second.tagMarks).toEqual(first.tagMarks);
    expect(textTag(doc, second.snapshot()).kind).toBe("tagged");
    expect(doc.structure(0).addedElements()).toHaveLength(1);

    history.undo(doc);
    expect(marksByType(doc).get(1)).toEqual([["P"], ["P"]]);
    expect(textTag(doc, north)).toMatchObject({ kind: "untagged" });
  });

  test("leaves an image drawn inside a text sequence to that text", async () => {
    const doc = await open(
      pagePdf(
        "/P <</MCID 3>> BDC BT /F1 12 Tf 72 700 Td (Caption text) Tj ET " +
          "q 50 0 0 50 72 600 cm /Im1 Do Q EMC\n",
      ),
    );
    const image = doc.page(0).images[0];
    expect(imageAccessibility(doc, image.snapshot()).kind).toBe("blocked");

    const run = doc.page(0).runs[0].snapshot();
    new HistoryStack().execute(
      setTextTagCommand(doc, [{ run, tag: textTag(doc, run) }], "P")!,
      doc,
    );
    const tagged = doc.page(0).runs[0].tagMarks[0];
    expect(image.mcid).toBe(tagged.mcid);
  });
});

describe("a page whose ParentTree entry the walk could miss", () => {
  test("stays read-only when wrong /Limits hide its entry", async () => {
    const bytes = buildClassicPdf(
      [
        {
          num: 1,
          body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R /MarkInfo << /Marked true >> >>",
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
          body: streamBody(
            "",
            "/H1 <</MCID 0>> BDC BT /F1 20 Tf 72 740 Td (Report) Tj ET EMC\n",
          ),
        },
        {
          num: 5,
          body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        },
        {
          num: 7,
          body: "<< /Type /StructTreeRoot /K 8 0 R /ParentTree 10 0 R /ParentTreeNextKey 1 >>",
        },
        {
          num: 8,
          body: "<< /Type /StructElem /S /Document /P 7 0 R /K [9 0 R] >>",
        },
        {
          num: 9,
          body: "<< /Type /StructElem /S /H1 /P 8 0 R /Pg 3 0 R /K 0 >>",
        },
        { num: 10, body: "<< /Kids [11 0 R] >>" },
        { num: 11, body: "<< /Limits [5 9] /Nums [0 [9 0 R]] >>" },
      ],
      1,
    );
    const doc = await open(bytes);
    expect(doc.structure(0).cannotAddElement()).not.toBeNull();
    const run = doc.page(0).runs[0].snapshot();
    expect(textTag(doc, run)).not.toMatchObject({
      kind: "untagged",
      taggable: true,
    });
  });
});

describe("tagAllPages and the tagged flag", () => {
  test("marks the document fully tagged in the same undo step", async () => {
    const store = await storeFor(pagePdf(COLUMNS));
    const doc = store.document!;
    doc.setMarkedTagged(false);
    await tagAllPages(store);
    expect(doc.markedTagged()).toBe(true);

    store.undo();
    expect(doc.markedTagged()).toBe(false);
    expect(hasUntaggedContent(doc, 0)).toBe(true);
    store.dispose();
  });
});

describe("readAllPagesInBackground", () => {
  test("reads unread pages after yielding, then publishes them", async () => {
    const store = await storeFor(pagePdf(COLUMNS));
    readAllPagesInBackground(store);
    expect(store.document!.page(0).loaded).toBe(false);

    await vi.waitFor(() =>
      expect(store.getState().pages[0].runs.length).toBeGreaterThan(0),
    );
    expect(store.document!.page(0).loaded).toBe(true);
    store.dispose();
  });

  test("reads nothing once cancelled", async () => {
    const store = await storeFor(pagePdf(COLUMNS));
    const publish = vi.spyOn(store, "publishPages");
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      readAllPagesInBackground(store)();
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }

    expect(store.document!.page(0).loaded).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    store.dispose();
  });
});
