// @vitest-environment node
// jsdom's Blob cannot stream, so the fixture's object stream would not inflate.
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
import { RetagTextCommand } from "@editor/tools/pdfTextEditor/commands/RetagTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";

const TAGGED_SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);
/** The sample's second page: the one with text in every tag. */
const PAGE = 1;

const opened: EditorDocument[] = [];

async function openSample(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(TAGGED_SAMPLE)),
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

function retag(
  doc: EditorDocument,
  history: HistoryStack,
  fragment: string,
  type: StructureType | null,
) {
  const run = runWith(doc, fragment);
  const mcid = run.snapshot().mcid!;
  history.execute(new RetagTextCommand({ pageIndex: PAGE, mcid, type }), doc);
  return { run, key: doc.structure(PAGE).blockElement(mcid)!.key };
}

function shownTag(doc: EditorDocument, fragment: string) {
  const tag = textTag(doc, runWith(doc, fragment).snapshot());
  return tag.kind === "tagged" ? tag.block.type : tag.kind;
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

describe("retagging text", () => {
  test("shows the new tag, adds it to the headings, and undoes", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    retag(doc, history, "Priorities for next quarter", "H3");

    expect(shownTag(doc, "Priorities for next quarter")).toBe("H3");
    expect(doc.headings()!.map((h) => h.type)).toEqual([
      "H1",
      "H2",
      "H3",
      "H3",
      "H5",
      "H3",
      "H2",
    ]);

    history.undo(doc);
    expect(shownTag(doc, "Priorities for next quarter")).toBe("P");
    expect(doc.structureEdits()).toEqual([]);
  });

  test("saves the new tag as the element's /S", async () => {
    const doc = await openSample();
    const { key } = retag(doc, new HistoryStack(), "Outlook", "H3");

    const saved = await readFileStructure(await savedBytes(doc));
    const block = saved!.blocks.find((b) => b.key === key);
    expect(block).toMatchObject({ role: "H3", type: "H3" });
  });

  test("gives text retagged as a Note the ID PDF/UA requires", async () => {
    const doc = await openSample();
    const { key } = retag(doc, new HistoryStack(), "All amounts", "Note");

    const pdf = await RawPdf.parse(await savedBytes(doc));
    const body = pdf!.objectBody(Number(key))!;
    expect(pdf!.dictName(body, "S")).toBe("Note");
    expect(pdf!.valueSpan(body, "ID")?.text).toBe(`(note-${key})`);
  });

  test("drops the retag when the text is set back to its own tag", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    retag(doc, history, "Priorities for next quarter", "H2");
    retag(doc, history, "Priorities for next quarter", "P");
    expect(doc.structureEdits()).toEqual([]);
  });

  test("retags a paragraph through the text of a link inside it", async () => {
    const doc = await openSample();
    const structure = doc.structure(PAGE);
    const link = structure.elements.find((el) => el.type === "Link")!;
    expect(structure.cannotRetag(link.mcids[0])).toBeNull();
    expect(structure.blockElement(link.mcids[0])?.type).toBe("P");
  });

  test("retags a custom role, giving it a standard meaning", async () => {
    const doc = await openSample();
    retag(doc, new HistoryStack(), "Pipeline for Q4", "P");
    expect(shownTag(doc, "Pipeline for Q4")).toBe("P");
  });

  test("refuses text in a list item, whose element holds more than text", async () => {
    const doc = await openSample();
    const mcid = runWith(doc, "Close the two delayed").snapshot().mcid!;
    expect(doc.structure(PAGE).cannotRetag(mcid)).toBe("not-text");
    expect(() =>
      new HistoryStack().execute(
        new RetagTextCommand({ pageIndex: PAGE, mcid, type: "H2" }),
        doc,
      ),
    ).toThrow();
    expect(doc.structureEdits()).toEqual([]);
  });
});
