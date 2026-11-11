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
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { RetagTextCommand } from "@editor/tools/pdfTextEditor/commands/RetagTextCommand";
import { TagTextCommand } from "@editor/tools/pdfTextEditor/commands/TagTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { SetMarkedTaggedCommand } from "@editor/tools/pdfTextEditor/commands/SetMarkedTaggedCommand";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  buildClassicPdf,
  singleContentPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import {
  sharedTextTag,
  textTag,
  type TextTagChoice,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";
import { setTextTagCommand } from "@editor/tools/pdfTextEditor/hooks/useTextAccessibility";

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
  as: TextTagChoice,
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

  test("tags text marked as an artifact", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagText(doc, history, "Acme Corp", "P");
    expect(shownTag(doc, "Acme Corp")).toBe("P");

    const reopened = await EditorDocument.open(await savedBytes(doc));
    opened.push(reopened);
    PdfiumTextReader.populate(reopened, reopened.page(PAGE));
    expect(shownTag(reopened, "Acme Corp")).toBe("P");

    history.undo(doc);
    expect(shownTag(doc, "Acme Corp")).toBe("artifact");
    expect(doc.structureEdits()).toEqual([]);
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

describe("tagging text in a file with no structure tree", () => {
  async function openUntagged(): Promise<EditorDocument> {
    const doc = await EditorDocument.open(
      singleContentPdf(
        "BT /F1 20 Tf 72 700 Td (Summary) Tj ET\n" +
          "BT /F1 12 Tf 72 670 Td (Sales rose in every region.) Tj ET\n",
      ),
    );
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    return doc;
  }

  test("offers the untagged text for tagging", async () => {
    const doc = await openUntagged();
    const run = doc.page(0).runs.find((r) => r.text.includes("Summary"))!;
    expect(textTag(doc, run.snapshot())).toEqual({
      kind: "untagged",
      documentTagged: true,
      taggable: true,
    });
  });

  test("saves a tree holding the tagged text, in the order it was read", async () => {
    const doc = await openUntagged();
    const history = new HistoryStack();
    tagText(doc, history, "Summary", "H1", 0);
    tagText(doc, history, "Sales rose", "P", 0);
    expect(doc.headings()!.map((h) => h.type)).toEqual(["H1"]);

    const bytes = await savedBytes(doc);
    const saved = await readFileStructure(bytes);
    expect(saved!.blocks.map((block) => block.type)).toEqual([
      "Document",
      "H1",
      "P",
    ]);
    const pdf = (await RawPdf.parse(bytes))!;
    expect(pdf.objectBody(pdf.rootNum)).not.toContain("/MarkInfo");

    const reopened = await EditorDocument.open(bytes);
    opened.push(reopened);
    PdfiumTextReader.populate(reopened, reopened.page(0));
    expect(
      reopened.page(0).runs.map((run) => {
        const tag = textTag(reopened, run.snapshot());
        return tag.kind === "tagged" ? tag.block.type : tag.kind;
      }),
    ).toEqual(["H1", "P"]);
  });

  test("claims to be tagged only once marked so, and not after an undo", async () => {
    const doc = await openUntagged();
    const history = new HistoryStack();
    tagText(doc, history, "Summary", "H1", 0);
    expect(doc.markedTagged()).toBe(false);
    history.execute(new SetMarkedTaggedCommand(true), doc);

    const marked = await savedBytes(doc);
    const pdf = (await RawPdf.parse(marked))!;
    expect(pdf.objectBody(pdf.rootNum)).toContain(
      "/MarkInfo << /Marked true >>",
    );
    const reopened = await EditorDocument.open(marked);
    opened.push(reopened);
    expect(reopened.markedTagged()).toBe(true);

    history.undo(doc);
    const unmarked = await savedBytes(doc);
    const again = (await RawPdf.parse(unmarked))!;
    expect(again.objectBody(again.rootNum)).not.toContain("/MarkInfo");
  });
});

describe("setting one tag on several runs", () => {
  test("reads runs tagged differently as mixed, and alike as their tag", async () => {
    const doc = await openSample();
    const mixed = targets(doc, "Priorities for next quarter", "Confidential");
    expect(sharedTextTag(mixed.map(({ tag }) => tag))).toEqual({
      kind: "mixed",
      settable: true,
      canBeArtifact: true,
    });
    const history = new HistoryStack();
    history.execute(setTextTagCommand(doc, mixed, "H3")!, doc);
    const alike = targets(doc, "Priorities for next quarter", "Confidential");
    expect(sharedTextTag(alike.map(({ tag }) => tag))).toMatchObject({
      kind: "tagged",
      block: { type: "H3" },
      cannotRetag: null,
    });
  });

  test("retags tagged text and tags untagged text as one undo step", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    history.execute(
      setTextTagCommand(
        doc,
        targets(doc, "Priorities for next quarter", "Confidential"),
        "H3",
      )!,
      doc,
    );
    expect(shownTag(doc, "Priorities for next quarter")).toBe("H3");
    expect(shownTag(doc, "Confidential")).toBe("H3");

    history.undo(doc);
    expect(shownTag(doc, "Priorities for next quarter")).not.toBe("H3");
    expect(shownTag(doc, "Confidential")).toBe("untagged");
  });

  test("leaves text whose tag cannot be set out, and is not settable with it", async () => {
    const doc = await openSample();
    const withListItem = targets(doc, "Confidential", "Close the two delayed");
    expect(sharedTextTag(withListItem.map(({ tag }) => tag))).toEqual({
      kind: "mixed",
      settable: false,
      canBeArtifact: false,
    });
    expect(
      setTextTagCommand(doc, targets(doc, "Close the two delayed"), "P"),
    ).toBeNull();
  });

  test("makes tagged and untagged text artifacts as one undo step", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    const both = targets(doc, "All amounts", "Confidential");
    history.execute(setTextTagCommand(doc, both, { artifact: null })!, doc);
    expect(shownTag(doc, "All amounts")).toBe("artifact");
    expect(shownTag(doc, "Confidential")).toBe("artifact");

    history.undo(doc);
    expect(shownTag(doc, "All amounts")).toBe("P");
    expect(shownTag(doc, "Confidential")).toBe("untagged");
    expect(doc.structureEdits()).toEqual([]);
  });
});

describe("reading what the file's artifacts are", () => {
  test("reads the kind the file names for each artifact", async () => {
    const doc = await openSample();
    const heard: number[] = [];
    doc.onArtifactKinds((pageIndex) => heard.push(pageIndex));
    expect(await doc.loadArtifactKinds(PAGE)).toBe(true);
    expect(heard).toEqual([PAGE]);
    expect(furnitureShown(doc, "Acme Corp")).toBe("Header");
    expect(furnitureShown(doc, "Page 2")).toBeNull();
    expect(runWith(doc, "Page 2").tagMarks).toEqual([
      {
        name: "Artifact",
        mcid: null,
        artifact: { type: "Pagination", subtype: null },
      },
    ]);
  });

  test("reads back the kind the session saved", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Confidential", { artifact: "Footer" });
    const reopened = await EditorDocument.open(await savedBytes(doc));
    opened.push(reopened);
    PdfiumTextReader.populate(reopened, reopened.page(PAGE));
    await reopened.loadArtifactKinds(PAGE);
    expect(furnitureShown(reopened, "Confidential")).toBe("Footer");
  });

  test("gives an artifact back its kind on undo", async () => {
    const doc = await openSample();
    await doc.loadArtifactKinds(PAGE);
    const history = new HistoryStack();
    tagAs(doc, history, "Page 2", { artifact: "PageNum" });
    tagText(doc, history, "Acme Corp", "P");
    history.undo(doc);
    history.undo(doc);
    expect(furnitureShown(doc, "Acme Corp")).toBe("Header");
    expect(await artifactOperators(await savedBytes(doc))).toEqual(
      expect.arrayContaining([
        "/Artifact <</Subtype/Header/Type/Pagination>> BDC",
        "/Artifact <</Type/Pagination>> BDC",
      ]),
    );
  });
});

describe("making text an artifact", () => {
  async function reopen(doc: EditorDocument): Promise<EditorDocument> {
    const reopened = await EditorDocument.open(await savedBytes(doc));
    opened.push(reopened);
    PdfiumTextReader.populate(reopened, reopened.page(PAGE));
    return reopened;
  }

  test("marks untagged text as an artifact, saves it, and undoes", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Confidential", { artifact: null });
    expect(shownTag(doc, "Confidential")).toBe("artifact");
    expect(shownTag(await reopen(doc), "Confidential")).toBe("artifact");

    history.undo(doc);
    expect(shownTag(doc, "Confidential")).toBe("untagged");
  });

  test("drops an element the session added, and brings it back on undo", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    const before = doc.headings()!.length;
    tagText(doc, history, "Confidential", "H2");
    tagAs(doc, history, "Confidential", { artifact: null });
    expect(shownTag(doc, "Confidential")).toBe("artifact");
    expect(doc.headings()).toHaveLength(before);
    expect(doc.structureEdits().some((edit) => edit.newElement)).toBe(false);

    history.undo(doc);
    expect(shownTag(doc, "Confidential")).toBe("H2");
    expect(doc.headings()).toHaveLength(before + 1);
  });

  test("turns the file's paragraph into an artifact on save", async () => {
    const doc = await openSample();
    const key = doc
      .structure(PAGE)
      .block(runWith(doc, "All amounts").snapshot().mcid!)!.key;
    tagAs(doc, new HistoryStack(), "All amounts", { artifact: null });
    expect(shownTag(doc, "All amounts")).toBe("artifact");

    const saved = await readFileStructure(await savedBytes(doc));
    expect(saved!.blocks.some((block) => block.key === key)).toBe(false);
    expect(shownTag(await reopen(doc), "All amounts")).toBe("artifact");
  });

  test("leaves a heading marked decorative out of the outline", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    const before = doc.headings()!.map((h) => h.type);
    tagAs(doc, history, "Outlook", { artifact: null });
    expect(doc.headings()!.map((h) => h.type)).not.toContain("H5");

    history.undo(doc);
    expect(doc.headings()!.map((h) => h.type)).toEqual(before);
  });

  test("gives decorative text a type again, keeping its element", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Outlook", { artifact: null });
    tagAs(doc, history, "Outlook", "H3");
    expect(shownTag(doc, "Outlook")).toBe("H3");
    expect(doc.structureEdits()).toEqual([
      expect.objectContaining({ type: "H3", decorative: false }),
    ]);
  });

  test("marks untagged text as page furniture, saved as a pagination artifact", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Confidential", { artifact: "Footer" });
    expect(furnitureShown(doc, "Confidential")).toBe("Footer");
    expect(await artifactOperators(await savedBytes(doc))).toContain(
      "/Artifact <</Subtype/Footer/Type/Pagination>> BDC",
    );

    history.undo(doc);
    expect(shownTag(doc, "Confidential")).toBe("untagged");
  });

  test("keeps page furniture's kind through an edit to its text", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Confidential", { artifact: "Footer" });
    const run = runWith(doc, "Confidential");
    history.execute(
      new EditTextCommand({
        pageIndex: PAGE,
        runId: run.id,
        nextText: "Confidential - internal use only, do not share",
      }),
      doc,
    );
    expect(furnitureShown(doc, "do not share")).toBe("Footer");
    expect(await artifactOperators(await savedBytes(doc))).toContain(
      "/Artifact <</Subtype/Footer/Type/Pagination>> BDC",
    );
  });

  test("changes what an artifact is, and back on undo", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Confidential", { artifact: null });
    tagAs(doc, history, "Confidential", { artifact: "Watermark" });
    expect(furnitureShown(doc, "Confidential")).toBe("Watermark");

    history.undo(doc);
    expect(furnitureShown(doc, "Confidential")).toBeNull();
    expect(
      setTextTagCommand(doc, targets(doc, "Confidential"), {
        artifact: null,
      }),
    ).toBeNull();
  });

  test("marks the file's paragraph as page furniture through its element", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "All amounts", { artifact: "Footer" });
    tagAs(doc, history, "All amounts", { artifact: "PageNum" });
    expect(furnitureShown(doc, "All amounts")).toBe("PageNum");
    expect(doc.structureEdits()).toEqual([
      expect.objectContaining({ decorative: true, furniture: "PageNum" }),
    ]);
    expect(await artifactOperators(await savedBytes(doc))).toContain(
      "/Artifact <</Type /Pagination /Subtype /PageNum>> BDC",
    );

    history.undo(doc);
    expect(furnitureShown(doc, "All amounts")).toBe("Footer");
  });

  test("reads artifacts of different kinds as mixed", async () => {
    const doc = await openSample();
    const history = new HistoryStack();
    tagAs(doc, history, "Confidential", { artifact: "Header" });
    const both = targets(doc, "Confidential", "Page 2");
    expect(sharedTextTag(both.map(({ tag }) => tag))).toMatchObject({
      kind: "mixed",
    });
  });

  test("refuses a paragraph holding a link, whose element holds more than text", async () => {
    const doc = await openSample();
    const tag = textTag(doc, runWith(doc, "appendix").snapshot());
    expect(tag).toMatchObject({ kind: "tagged", canBeArtifact: false });
  });

  test("refuses text in a list item", async () => {
    const doc = await openSample();
    const tag = textTag(doc, runWith(doc, "Close the two delayed").snapshot());
    expect(tag).toMatchObject({ kind: "tagged", canBeArtifact: false });
  });
});

function furnitureShown(doc: EditorDocument, fragment: string) {
  const tag = textTag(doc, runWith(doc, fragment).snapshot());
  if (tag.kind !== "artifact") throw new Error(`"${fragment}" is ${tag.kind}`);
  return tag.furniture;
}

function targets(doc: EditorDocument, ...fragments: string[]) {
  return fragments.map((fragment) => {
    const run = runWith(doc, fragment).snapshot();
    return { run, tag: textTag(doc, run) };
  });
}

/** The operators opening artifacts in the saved file's sample page. */
async function artifactOperators(bytes: Uint8Array): Promise<string[]> {
  const pdf = (await RawPdf.parse(bytes))!;
  const content = await pdf.pageContent(pdf.pageNumberAt(PAGE)!);
  return toLatin1(content!).match(/\/Artifact\b[^\n]*?(?:BDC|BMC)/g) ?? [];
}

function tagAs(
  doc: EditorDocument,
  history: HistoryStack,
  fragment: string,
  choice: TextTagChoice,
) {
  const command = setTextTagCommand(doc, targets(doc, fragment), choice);
  if (!command) {
    throw new Error(`"${fragment}" cannot be tagged ${JSON.stringify(choice)}`);
  }
  history.execute(command, doc);
}
