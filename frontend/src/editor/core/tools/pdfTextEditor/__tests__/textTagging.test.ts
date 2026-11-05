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
import { TagTextCommand } from "@editor/tools/pdfTextEditor/commands/TagTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import {
  canTagText,
  textTag,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";

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
  return { run, key: doc.structure(PAGE).block(mcid)!.key };
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
    expect(structure.block(link.mcids[0])?.type).toBe("P");
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

function tagText(
  doc: EditorDocument,
  history: HistoryStack,
  fragment: string,
  as: StructureType,
  pageIndex = PAGE,
) {
  const run = doc.page(pageIndex).runs.find((r) => r.text.includes(fragment))!;
  history.execute(new TagTextCommand({ pageIndex, runId: run.id, as }), doc);
  return run;
}

/** A tagged page: an H1, then a two-line paragraph its content leaves untagged. */
function untaggedParagraphPdf(): Uint8Array {
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
        body: streamBody(
          "",
          "/H1 <</MCID 0>> BDC BT /F1 20 Tf 72 700 Td (Summary) Tj ET EMC\n" +
            "BT /F1 12 Tf 72 670 Td (Sales rose in every region,) Tj ET\n" +
            "BT /F1 12 Tf 72 656 Td (led by the new product line.) Tj ET\n",
        ),
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
      {
        num: 8,
        body: "<< /Type /StructElem /S /H1 /P 7 0 R /Pg 3 0 R /K 0 >>",
      },
      { num: 9, body: "<< /Nums [0 [8 0 R]] >>" },
    ],
    1,
  );
}

describe("tagging untagged text", () => {
  test("tags the text, shows it, and saves it as a new element", async () => {
    const doc = await openSample();
    tagText(doc, new HistoryStack(), "Confidential", "P");
    expect(shownTag(doc, "Confidential")).toBe("P");

    const reopened = await EditorDocument.open(await savedBytes(doc));
    opened.push(reopened);
    PdfiumTextReader.populate(reopened, reopened.page(PAGE));
    expect(shownTag(reopened, "Confidential")).toBe("P");
  });

  test("puts a new heading in the outline where the save puts it", async () => {
    const doc = await openSample();
    tagText(doc, new HistoryStack(), "Confidential", "H2");
    const inSession = doc.headings()!.map((h) => h.type);
    expect(inSession.at(-1)).toBe("H2");

    const saved = await readFileStructure(await savedBytes(doc));
    expect(
      saved!.blocks.flatMap(({ type }) =>
        type?.startsWith("H") ? [type] : [],
      ),
    ).toEqual(inSession);
  });

  test("removes the tag on undo", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    const run = tagText(doc, history, "Confidential", "P");
    history.undo(doc);
    expect(run.snapshot().mcid).toBeUndefined();
    expect(shownTag(doc, "Confidential")).toBe("untagged");
    expect(doc.structureEdits()).toEqual([]);
  });

  test("retags text it tagged before the save", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagText(doc, history, "Confidential", "P");
    retag(doc, history, "Confidential", "Note");
    expect(shownTag(doc, "Confidential")).toBe("Note");

    history.undo(doc);
    expect(shownTag(doc, "Confidential")).toBe("P");
  });

  test("refuses text marked as an artifact", async () => {
    const doc = await openSample();
    const header = runWith(doc, "Acme Corp");
    expect(canTagText(doc, header.snapshot())).toBe(false);
    expect(() => tagText(doc, new HistoryStack(), "Acme Corp", "P")).toThrow();
  });

  test("tags every line of a paragraph as one element", async () => {
    const doc = await EditorDocument.open(untaggedParagraphPdf());
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    tagText(doc, new HistoryStack(), "Sales rose", "P", 0);

    const saved = await readFileStructure(await savedBytes(doc));
    const elements = saved!.pages.get(0)!.elements;
    expect(elements.map((el) => el.type)).toEqual(["H1", "P"]);
    expect(elements[1].mcids.length).toBeGreaterThanOrEqual(1);

    const reopened = await EditorDocument.open(await savedBytes(doc));
    opened.push(reopened);
    PdfiumTextReader.populate(reopened, reopened.page(0));
    for (const run of reopened.page(0).runs) {
      expect(textTag(reopened, run.snapshot()).kind).toBe("tagged");
    }
  });
});
