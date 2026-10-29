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
import { SetDocumentLanguageCommand } from "@editor/tools/pdfTextEditor/commands/SetDocumentLanguageCommand";
import { SetInnerLanguageCommand } from "@editor/tools/pdfTextEditor/commands/SetInnerLanguageCommand";
import { SetTextLanguageCommand } from "@editor/tools/pdfTextEditor/commands/SetTextLanguageCommand";
import { TagTextRangeCommand } from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { canonicalLanguageTag } from "@editor/tools/pdfTextEditor/model/languageTag";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { innerTags } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const TAGGED_SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/tagged-sample.pdf",
);
/** The sample's second page: paragraphs, and a German Span inside one. */
const PAGE = 1;

// A French test set in English: the question (MCID 0) and the letter it asks
// about, two paragraphs (MCIDs 1 and 2), the second already marked French.
const CONTENT =
  "/P <</MCID 0>> BDC BT /F1 12 Tf 72 700 Td (Describe the letter below.) Tj ET EMC\n" +
  "/P <</MCID 1>> BDC BT /F1 12 Tf 72 670 Td (Chere Marie, merci pour ta lettre.) Tj ET EMC\n" +
  "/P <</MCID 2>> BDC BT /F1 16 Tf 72 630 Td (Mes vacances) Tj ET " +
  "BT /F1 12 Tf 72 612 Td (Nous sommes alles a la plage.) Tj ET EMC\n";

/** Document 7 holds paragraphs 8, 9 and 10; the catalog sets `catalogLang`. */
function letterPdf(catalogLang = ""): Uint8Array {
  return buildClassicPdf(
    [
      {
        num: 1,
        body: `<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >>${catalogLang} >>`,
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
        body: "<< /Type /StructTreeRoot /K 7 0 R /ParentTree 11 0 R /ParentTreeNextKey 1 >>",
      },
      {
        num: 7,
        body: "<< /Type /StructElem /S /Document /P 6 0 R /K [8 0 R 9 0 R 10 0 R] >>",
      },
      { num: 8, body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 0 >>" },
      { num: 9, body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 1 >>" },
      {
        num: 10,
        body: "<< /Type /StructElem /S /P /P 7 0 R /Pg 3 0 R /K 2 /Lang (fr) >>",
      },
      { num: 11, body: "<< /Nums [0 [8 0 R 9 0 R 10 0 R]] >>" },
    ],
    1,
  );
}

function untaggedPdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /Font << /F1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody("", "BT /F1 12 Tf 72 700 Td (Untagged) Tj ET"),
      },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

const opened: EditorDocument[] = [];

async function open(bytes: Uint8Array, page = 0): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(page));
  return doc;
}

async function openSample(): Promise<EditorDocument> {
  return open(new Uint8Array(await readFile(TAGGED_SAMPLE)), PAGE);
}

function runWith(doc: EditorDocument, page: number, fragment: string) {
  const run = doc.page(page).runs.find((r) => r.text.includes(fragment));
  if (!run) throw new Error(`no run contains "${fragment}"`);
  return run;
}

function mcidOf(doc: EditorDocument, page: number, fragment: string): number {
  return runWith(doc, page, fragment).snapshot().mcid!;
}

async function savedBytes(doc: EditorDocument): Promise<Uint8Array> {
  const { blob } = await exportToBlob(doc, "letter.pdf");
  return new Uint8Array(await blob.arrayBuffer());
}

async function catalogLang(bytes: Uint8Array): Promise<string | null> {
  const pdf = (await RawPdf.parse(bytes))!;
  const value = pdf.resolve(pdf.objectBody(pdf.rootNum)!, "Lang");
  return value === null ? null : decodeTextString(value.trim());
}

async function savedLangs(doc: EditorDocument) {
  return (await readFileStructure(await savedBytes(doc)))!.languages;
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

describe("language tags", () => {
  test.each([
    ["en-ie", "en-IE"],
    ["FR", "fr"],
    [" ga ", "ga"],
    ["zh-hant", "zh-Hant"],
  ])("canonicalises %j as %j", (tag, canonical) => {
    expect(canonicalLanguageTag(tag)).toBe(canonical);
  });

  test.each(["", "en_IE", "english please", "-fr", "toolongtag"])(
    "refuses %j",
    (tag) => {
      expect(canonicalLanguageTag(tag)).toBeNull();
    },
  );
});

describe("document language", () => {
  test("reads the catalog's /Lang", async () => {
    const doc = await openSample();
    expect(doc.documentLanguage()).toBe("en-US");
  });

  test("saves a new language as the catalog's /Lang, and undoes", async () => {
    const doc = await open(letterPdf());
    expect(doc.documentLanguage()).toBeNull();
    const history = new HistoryStack();
    history.execute(new SetDocumentLanguageCommand({ lang: "en-IE" }), doc);

    expect(doc.documentLanguage()).toBe("en-IE");
    expect(await catalogLang(await savedBytes(doc))).toBe("en-IE");

    history.undo(doc);
    expect(doc.documentLanguageEdit()).toBeUndefined();
  });

  test("removes the catalog's /Lang", async () => {
    const doc = await open(letterPdf(" /Lang (en)"));
    new HistoryStack().execute(
      new SetDocumentLanguageCommand({ lang: null }),
      doc,
    );
    expect(await catalogLang(await savedBytes(doc))).toBeNull();
  });

  test("sets an untagged document's language", async () => {
    const doc = await open(untaggedPdf());
    const mcid = runWith(doc, 0, "Untagged").snapshot().mcid;
    expect(mcid).toBeUndefined();
    new HistoryStack().execute(
      new SetDocumentLanguageCommand({ lang: "ga" }),
      doc,
    );
    expect(await catalogLang(await savedBytes(doc))).toBe("ga");
  });
});

describe("text language", () => {
  test("reads a block's own language, and one it inherits", async () => {
    const doc = await open(letterPdf(" /Lang (en-IE)"));
    expect(doc.textLanguage(0, mcidOf(doc, 0, "Describe the letter"))).toEqual({
      own: null,
      inherited: "en-IE",
    });
    expect(doc.textLanguage(0, mcidOf(doc, 0, "Mes vacances"))).toEqual({
      own: "fr",
      inherited: "en-IE",
    });
  });

  test("saves several blocks' language in one step, and undoes it", async () => {
    const doc = await open(letterPdf(" /Lang (en-IE)"));
    const targets = ["Chere Marie", "Mes vacances"].map((fragment) => ({
      pageIndex: 0,
      mcid: mcidOf(doc, 0, fragment),
    }));
    const history = new HistoryStack();
    history.execute(
      new SetTextLanguageCommand({ targets, lang: "fr-FR" }),
      doc,
    );

    const langs = await savedLangs(doc);
    expect(langs.get("9")?.lang).toBe("fr-FR");
    expect(langs.get("10")?.lang).toBe("fr-FR");
    expect(langs.get("8")?.lang).toBeNull();

    history.undo(doc);
    expect(doc.textLanguage(0, targets[1].mcid)!.own).toBe("fr");
    expect(doc.structureEdits()).toEqual([]);
  });

  test("clears a block's language, leaving it to inherit", async () => {
    const doc = await open(letterPdf(" /Lang (en-IE)"));
    const mcid = mcidOf(doc, 0, "Mes vacances");
    new HistoryStack().execute(
      new SetTextLanguageCommand({
        targets: [{ pageIndex: 0, mcid }],
        lang: null,
      }),
      doc,
    );
    expect(doc.textLanguage(0, mcid)).toEqual({
      own: null,
      inherited: "en-IE",
    });
    expect((await savedLangs(doc)).get("10")?.lang).toBeNull();
  });

  test("refuses text with no element", async () => {
    const doc = await open(untaggedPdf());
    expect(doc.structure(0).cannotSetLanguage(0)).toBe("untagged");
  });
});

describe("part of a block's text", () => {
  test("reads the language a Span inside a paragraph has", async () => {
    const doc = await openSample();
    const run = runWith(doc, PAGE, "Umsatzerlöse").snapshot();
    const tag = innerTags(doc, run).find((t) => t.text === "Umsatzerlöse")!;
    expect(tag.language).toEqual({ own: "de-DE", inherited: "en-US" });
  });

  test("saves a new language for a Span inside a paragraph", async () => {
    const doc = await openSample();
    const run = runWith(doc, PAGE, "Umsatzerlöse").snapshot();
    const { key } = innerTags(doc, run).find((t) => t.text === "Umsatzerlöse")!;
    new HistoryStack().execute(
      new SetInnerLanguageCommand({ pageIndex: PAGE, key, lang: "de-AT" }),
      doc,
    );
    expect((await savedLangs(doc)).get(key)?.lang).toBe("de-AT");
  });

  test("marks selected words as a Span in another language", async () => {
    const doc = await open(letterPdf(" /Lang (en-IE)"));
    const run = runWith(doc, 0, "Describe the letter");
    const start = run.text.indexOf("letter");
    new HistoryStack().execute(
      new TagTextRangeCommand({
        pageIndex: 0,
        runId: run.id,
        start,
        end: start + "letter".length,
        as: "Span",
        lang: "fr",
      }),
      doc,
    );

    const saved = (await readFileStructure(await savedBytes(doc)))!;
    const span = saved.pages.get(0)!.elements.find((el) => el.type === "Span")!;
    expect(span.lang).toBe("fr");
    expect(span.block.key).toBe("8");
    expect(saved.languages.get("8")?.lang).toBeNull();
  });

  test("keeps a French paragraph's language on both halves of a heading cut from it", async () => {
    const doc = await open(letterPdf(" /Lang (en-IE)"));
    const run = runWith(doc, 0, "Chere Marie");
    const start = run.text.indexOf("merci");
    new HistoryStack().execute(
      new SetTextLanguageCommand({
        targets: [{ pageIndex: 0, mcid: run.snapshot().mcid! }],
        lang: "fr",
      }),
      doc,
    );
    new HistoryStack().execute(
      new TagTextRangeCommand({
        pageIndex: 0,
        runId: run.id,
        start,
        end: start + "merci".length,
        as: "H2",
      }),
      doc,
    );

    const saved = (await readFileStructure(await savedBytes(doc)))!;
    const paragraphs = saved.blocks.filter((b) => ["P", "H2"].includes(b.role));
    const french = paragraphs
      .filter((b) => saved.languages.get(b.key)?.lang === "fr")
      .map((b) => b.role);
    // The paragraph, the heading cut from it, the rest of it, and the
    // paragraph the file already marked French.
    expect(french).toEqual(["P", "H2", "P", "P"]);
  });
});
