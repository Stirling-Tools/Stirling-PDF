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
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { readTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";
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
  const { blob } = await exportToBlob(doc, "page.pdf");
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
      expect.objectContaining({ current: 0, total: 1 }),
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

  test("records nothing when nothing is untagged", async () => {
    const store = await storeFor(pagePdf(COLUMNS));
    await tagAllPages(store);
    const tagged = store.history.peekUndo();
    await tagAllPages(store);
    expect(store.history.peekUndo()).toBe(tagged);
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
