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
import {
  TagFormFieldCommand,
  taggableFormFields,
} from "@editor/tools/pdfTextEditor/commands/TagFormFieldCommand";
import {
  TagPageContentCommand,
  hasUntaggedContent,
} from "@editor/tools/pdfTextEditor/commands/TagPageContentCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { elementKids } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  RawPdf,
  referencedObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  buildClassicPdf,
  streamBody,
  type FixtureObject,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// "Name:" in 12 pt Helvetica from x 72 ends near x 104, left of NAME_FIELD;
// "Email:" sits the same way 60 pt lower, left of EMAIL_FIELD.
const NAME_LINE = "BT /F1 12 Tf 72 700 Td (Name: ) Tj ET\n";
const EMAIL_LINE = "BT /F1 12 Tf 72 640 Td (Email:) Tj ET\n";
const NAME_FIELD = 20;
const EMAIL_FIELD = 21;
const EMAIL_PARENT = 22;

function nameField(extra = ""): FixtureObject {
  return {
    num: NAME_FIELD,
    body: `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /Rect [110 694 300 714]${extra} >>`,
  };
}

/** A widget kid of field EMAIL_PARENT, which says its type. */
function emailField(fieldExtra = ""): FixtureObject[] {
  return [
    {
      num: EMAIL_FIELD,
      body: `<< /Type /Annot /Subtype /Widget /Parent ${EMAIL_PARENT} 0 R /Rect [110 634 300 654] >>`,
    },
    {
      num: EMAIL_PARENT,
      body: `<< /FT /Tx /T (email) /Kids [${EMAIL_FIELD} 0 R]${fieldExtra} >>`,
    },
  ];
}

function page(
  content: string,
  annots: readonly number[],
  extra = "",
): FixtureObject[] {
  return [
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    {
      num: 3,
      body:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ` +
        `/Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]${extra} ` +
        "/Resources << /Font << /F1 5 0 R >> >> >>",
    },
    { num: 4, body: streamBody("", content) },
    { num: 5, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
  ];
}

/** No structure tree: `content` and the `widgets` the page lists. */
function untaggedPdf(
  content: string,
  widgets: FixtureObject[],
  annots = widgets
    .filter((w) => w.body.includes("/Subtype /Widget"))
    .map((w) => w.num),
): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      ...page(content, annots),
      ...widgets,
    ],
    1,
  );
}

/**
 * "Name:" tagged as paragraph 9 (MCID 0) in Document 8, with NAME_FIELD, or
 * with `held` a Form 10 already holding it.
 */
function taggedPdf({ held = false } = {}): Uint8Array {
  const parentTree = held ? " 1 10 0 R" : "";
  return buildClassicPdf(
    [
      {
        num: 1,
        body: "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 7 0 R >>",
      },
      ...page(
        `/P <</MCID 0>> BDC ${NAME_LINE}EMC\n`,
        [NAME_FIELD],
        " /StructParents 0",
      ),
      {
        num: 7,
        body: `<< /Type /StructTreeRoot /K 8 0 R /ParentTree << /Nums [0 [9 0 R]${parentTree}] >> /ParentTreeNextKey 2 >>`,
      },
      {
        num: 8,
        body: `<< /Type /StructElem /S /Document /P 7 0 R /K [9 0 R${held ? " 10 0 R" : ""}] >>`,
      },
      {
        num: 9,
        body: "<< /Type /StructElem /S /P /P 8 0 R /Pg 3 0 R /K 0 >>",
      },
      ...(held
        ? [
            {
              num: 10,
              body: `<< /Type /StructElem /S /Form /P 8 0 R /Pg 3 0 R /K << /Type /OBJR /Obj ${NAME_FIELD} 0 R >> >>`,
            },
          ]
        : []),
      nameField(held ? " /StructParent 1" : ""),
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

async function saved(doc: EditorDocument): Promise<RawPdf> {
  const { blob } = await exportToBlob(doc, "form.pdf");
  return (await RawPdf.parse(new Uint8Array(await blob.arrayBuffer())))!;
}

function autoTag(doc: EditorDocument, history = new HistoryStack()): void {
  history.execute(new TagPageContentCommand({ pageIndex: 0 }), doc);
}

function treeRoot(pdf: RawPdf): number {
  return pdf.dictRef(pdf.objectBody(pdf.rootNum)!, "StructTreeRoot")!;
}

/** An element's kids: an element as its /S, an OBJR as `OBJR n` for the object it names, an MCID as its number. */
function kidsOf(pdf: RawPdf, num: number): string[] {
  return elementKids(pdf, pdf.objectBody(num)!)!.map((kid) => {
    const ref = referencedObject(kid);
    if (ref !== null) return `/${pdf.dictName(pdf.objectBody(ref)!, "S")}`;
    if (!kid.startsWith("<<")) return kid;
    return `${pdf.dictName(kid, "Type")} ${pdf.dictRef(kid, "Obj")}`;
  });
}

function documentElement(pdf: RawPdf): number {
  return pdf.dictRef(pdf.objectBody(treeRoot(pdf))!, "K")!;
}

/** The element the widget's /StructParent entry names; null when it has none. */
function holder(pdf: RawPdf, widget: number): number | null {
  const key = pdf.dictInt(pdf.objectBody(widget)!, "StructParent");
  if (key === null) return null;
  const entry = pdf.numberTreeEntry(treeRoot(pdf), "ParentTree", key);
  return entry ? referencedObject(entry.span.text) : null;
}

function tooltip(pdf: RawPdf, field: number): string | null {
  const span = pdf.valueSpan(pdf.objectBody(field)!, "TU");
  return span && decodeTextString(span.text);
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

describe("reading form fields", () => {
  test("reads each shown widget the page references, with its field's type and name", async () => {
    const structure = await readFileStructure(
      untaggedPdf(
        NAME_LINE,
        [
          nameField(),
          ...emailField(" /TU (Email address)"),
          {
            num: 23,
            body: "<< /Type /Annot /Subtype /Widget /FT /Tx /F 2 /Rect [0 0 10 10] >>",
          },
        ],
        [NAME_FIELD, EMAIL_FIELD, 23],
      ),
    );
    expect(structure!.widgets.get(0)).toEqual([
      {
        annotation: NAME_FIELD,
        rect: { x: 110, y: 694, width: 190, height: 20 },
        fieldType: "Tx",
        tooltip: null,
        holder: null,
      },
      expect.objectContaining({
        annotation: EMAIL_FIELD,
        fieldType: "Tx",
        tooltip: "Email address",
      }),
    ]);
  });

  test("reads the Form the file gives a widget", async () => {
    const structure = await readFileStructure(taggedPdf({ held: true }));
    expect(structure!.widgets.get(0)![0].holder).toBe("10");
  });
});

describe("tagging form fields", () => {
  test("tags a field as a Form after its label, named by the label", async () => {
    const doc = await open(untaggedPdf(NAME_LINE, [nameField()]));
    autoTag(doc);

    const pdf = await saved(doc);
    const document = documentElement(pdf);
    expect(kidsOf(pdf, document)).toEqual(["/P", "/Form"]);
    const form = holder(pdf, NAME_FIELD)!;
    expect(kidsOf(pdf, form)).toEqual([`OBJR ${NAME_FIELD}`]);
    expect(pdf.dictRef(pdf.objectBody(form)!, "P")).toBe(document);
    expect(tooltip(pdf, NAME_FIELD)).toBe("Name");
  });

  test("reads each field after its own label, and names a kid's field", async () => {
    const doc = await open(
      untaggedPdf(NAME_LINE + EMAIL_LINE, [nameField(), ...emailField()]),
    );
    autoTag(doc);

    const pdf = await saved(doc);
    const document = documentElement(pdf);
    expect(kidsOf(pdf, document)).toEqual(["/P", "/Form", "/P", "/Form"]);
    const forms = elementKids(pdf, pdf.objectBody(document)!)!
      .map(referencedObject)
      .filter((_, index) => index % 2 === 1);
    expect(forms).toEqual([holder(pdf, NAME_FIELD), holder(pdf, EMAIL_FIELD)]);
    expect(tooltip(pdf, EMAIL_PARENT)).toBe("Email");
    expect(tooltip(pdf, EMAIL_FIELD)).toBeNull();
  });

  test("names a check box by the text right of it", async () => {
    const doc = await open(
      untaggedPdf("BT /F1 12 Tf 90 600 Td (I agree) Tj ET\n", [
        {
          num: NAME_FIELD,
          body: "<< /Type /Annot /Subtype /Widget /FT /Btn /T (agree) /Rect [72 598 84 610] >>",
        },
      ]),
    );
    autoTag(doc);
    expect(tooltip(await saved(doc), NAME_FIELD)).toBe("I agree");
  });

  test("leaves a field with no label nearby unnamed", async () => {
    const doc = await open(
      untaggedPdf("BT /F1 12 Tf 72 300 Td (Far away) Tj ET\n", [nameField()]),
    );
    autoTag(doc);
    const pdf = await saved(doc);
    expect(holder(pdf, NAME_FIELD)).not.toBeNull();
    expect(tooltip(pdf, NAME_FIELD)).toBeNull();
  });

  test("keeps the name a field already has", async () => {
    const doc = await open(
      untaggedPdf(NAME_LINE + EMAIL_LINE, [
        nameField(" /TU (Full name)"),
        ...emailField(" /TU (Email address)"),
      ]),
    );
    autoTag(doc);
    const pdf = await saved(doc);
    expect(tooltip(pdf, NAME_FIELD)).toBe("Full name");
    expect(tooltip(pdf, EMAIL_PARENT)).toBe("Email address");
  });

  test("undoing the page's tags leaves the field as it was", async () => {
    const doc = await open(untaggedPdf(NAME_LINE, [nameField()]));
    const history = new HistoryStack();
    autoTag(doc, history);
    history.undo(doc);
    expect(doc.annotationEdits()).toEqual([]);
    history.redo(doc);
    expect(doc.annotationEdits()).toEqual([
      expect.objectContaining({
        annotation: NAME_FIELD,
        newForm: { after: expect.any(Number) },
        tooltip: "Name",
      }),
    ]);
  });

  test("tags the untagged field on a page whose text is tagged", async () => {
    const doc = await open(taggedPdf());
    expect(hasUntaggedContent(doc, 0)).toBe(true);
    new HistoryStack().execute(
      new TagFormFieldCommand({ pageIndex: 0, annotation: NAME_FIELD }),
      doc,
    );
    const pdf = await saved(doc);
    expect(kidsOf(pdf, 8)).toEqual(["/P", "/Form"]);
    expect(tooltip(pdf, NAME_FIELD)).toBe("Name");
  });

  test("leaves a field the file already gives an element alone", async () => {
    const doc = await open(taggedPdf({ held: true }));
    expect(taggableFormFields(doc, 0)).toEqual([]);
    expect(hasUntaggedContent(doc, 0)).toBe(false);
  });
});
