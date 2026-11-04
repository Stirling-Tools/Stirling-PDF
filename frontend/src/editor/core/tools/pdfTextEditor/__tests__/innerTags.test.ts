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
import { RetagInnerCommand } from "@editor/tools/pdfTextEditor/commands/RetagInnerCommand";
import { TagTextRangeCommand } from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  isInlineType,
  TEXT_RANGE_TYPES,
  type StructureElement,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { innerTags } from "@editor/tools/pdfTextEditor/util/textAccessibility";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);
const PAGE = 1;
const INLINE_RANGE_TYPES = TEXT_RANGE_TYPES.filter(isInlineType);

const opened: EditorDocument[] = [];

async function open(bytes?: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    bytes ?? new Uint8Array(await readFile(SAMPLE)),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(PAGE));
  return doc;
}

function runWith(doc: EditorDocument, fragment: string) {
  const run = doc.page(PAGE).runs.find((r) => r.text.includes(fragment));
  if (!run) throw new Error(`no run contains "${fragment}"`);
  return run;
}

function tagsIn(doc: EditorDocument, fragment: string) {
  return innerTags(doc, runWith(doc, fragment).snapshot());
}

function retag(
  doc: EditorDocument,
  history: HistoryStack,
  key: string,
  type: StructureType | null,
) {
  history.execute(new RetagInnerCommand({ pageIndex: PAGE, key, type }), doc);
}

async function saved(doc: EditorDocument) {
  const { blob } = await exportToBlob(doc, "tags.pdf");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, structure: (await readFileStructure(bytes))! };
}

/** The page's elements of `type` whose text is in block `block`. */
function elementsIn(
  elements: readonly StructureElement[],
  block: string,
  type: StructureType,
) {
  return elements.filter((el) => el.type === type && el.block.key === block);
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

describe("tags inside a run's text", () => {
  test("lists a file's inline elements with the text they mark", async () => {
    const doc = await open();
    expect(tagsIn(doc, "German subsidiaries")).toMatchObject([
      {
        text: "Umsatzerlöse",
        role: { type: "Span" },
        types: INLINE_RANGE_TYPES,
        removable: true,
      },
    ]);
  });

  test("offers no change to a list item's parts", async () => {
    const doc = await open();
    expect(tagsIn(doc, "Close the two delayed")).toMatchObject([
      { text: "1. ", role: { type: "Lbl" }, types: [], removable: false },
      { role: { type: "LBody" }, types: [], removable: false },
    ]);
  });

  test("lists none for text with no element inside its block", async () => {
    const doc = await open();
    expect(tagsIn(doc, "these figures are unaudited")).toEqual([]);
  });

  test("saves a retagged inline element under its new type", async () => {
    const doc = await open();
    const [span] = tagsIn(doc, "German subsidiaries");
    retag(doc, new HistoryStack(), span.key, "Code");
    expect(tagsIn(doc, "German subsidiaries")).toMatchObject([
      { text: "Umsatzerlöse", role: { type: "Code" } },
    ]);

    const block = doc
      .structure(PAGE)
      .element(
        doc.structure(PAGE).elements.find((el) => el.key === span.key)!
          .mcids[0],
      )!.block.key;
    const { structure } = await saved(doc);
    const elements = structure.pages.get(PAGE)!.elements;
    expect(elementsIn(elements, block, "Span")).toHaveLength(0);
    expect(elementsIn(elements, block, "Code")).toHaveLength(1);
  });

  test("saves a removed inline element's text as its paragraph's", async () => {
    const doc = await open();
    const [span] = tagsIn(doc, "German subsidiaries");
    const removed = doc
      .structure(PAGE)
      .elements.find((el) => el.key === span.key)!;
    retag(doc, new HistoryStack(), span.key, null);
    expect(tagsIn(doc, "German subsidiaries")).toEqual([]);

    const { structure } = await saved(doc);
    const elements = structure.pages.get(PAGE)!.elements;
    expect(elementsIn(elements, removed.block.key, "Span")).toHaveLength(0);
    const paragraph = elements.find((el) => el.key === removed.block.key)!;
    expect(paragraph.type).toBe("P");
    expect(paragraph.mcids).toEqual(expect.arrayContaining(removed.mcids));
  });

  test("lists text the session tagged, and can change or remove it", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = runWith(doc, "Growth slowed");
    const start = run.text.indexOf("two large contracts");
    history.execute(
      new TagTextRangeCommand({
        pageIndex: PAGE,
        runId: run.id,
        start,
        end: start + "two large contracts".length,
        as: "Span",
      }),
      doc,
    );
    const sessionTags = () =>
      tagsIn(doc, "Growth slowed").filter((tag) => tag.key.startsWith("added"));
    const [cut] = sessionTags();
    expect(cut).toMatchObject({
      text: "two large contracts",
      role: { type: "Span" },
      types: TEXT_RANGE_TYPES,
      removable: true,
    });

    retag(doc, history, cut.key, "Code");
    expect(sessionTags()).toMatchObject([{ role: { type: "Code" } }]);
    retag(doc, history, cut.key, null);
    expect(sessionTags()).toEqual([]);
    expect(doc.structureEdits()).toMatchObject([{ cut: { type: null } }]);

    const paragraph = doc.structure(PAGE).block(run.snapshot().mcid!)!.key;
    const { structure } = await saved(doc);
    const elements = structure.pages.get(PAGE)!.elements;
    expect(elementsIn(elements, paragraph, "Span")).toHaveLength(0);
    expect(elementsIn(elements, paragraph, "Code")).toHaveLength(0);
  });

  test("puts a removed element back on undo", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const [span] = tagsIn(doc, "German subsidiaries");
    retag(doc, history, span.key, null);

    history.undo(doc);
    expect(tagsIn(doc, "German subsidiaries")).toMatchObject([
      { text: "Umsatzerlöse", role: { type: "Span" } },
    ]);
    expect(doc.structureEdits()).toEqual([]);
  });

  test("refuses a change it does not offer", async () => {
    const doc = await open();
    const [label] = tagsIn(doc, "Close the two delayed");
    expect(() => retag(doc, new HistoryStack(), label.key, null)).toThrow();
    expect(doc.structureEdits()).toEqual([]);
  });
});
