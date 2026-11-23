import { describe, expect, test } from "vitest";
import {
  PDFDocument,
  PDFName,
  PDFPage,
  PDFRef,
  PDFString,
} from "@cantoo/pdf-lib";
import {
  readSignatureLayout,
  viewerRectToPdfBox,
} from "@editor/services/signatureFieldLayout";

type Rect = [number, number, number, number];

function addSignatureField(
  doc: PDFDocument,
  page: PDFPage,
  name: string,
  rect: Rect,
  options: { signed?: boolean; asKid?: boolean; linkPage?: boolean } = {},
) {
  const { signed = false, asKid = false, linkPage = true } = options;
  const widget = doc.context.obj({
    Type: "Annot",
    Subtype: "Widget",
    Rect: rect,
    F: 4,
  });
  if (linkPage) widget.set(PDFName.of("P"), page.ref);
  const widgetRef = doc.context.register(widget);
  page.node.addAnnot(widgetRef);

  let fieldRef: PDFRef = widgetRef;
  const fieldDict = asKid ? doc.context.obj({ Kids: [widgetRef] }) : widget;
  if (asKid) {
    fieldRef = doc.context.register(fieldDict);
    widget.set(PDFName.of("Parent"), fieldRef);
  }
  fieldDict.set(PDFName.of("FT"), PDFName.of("Sig"));
  fieldDict.set(PDFName.of("T"), PDFString.of(name));
  if (signed) {
    fieldDict.set(
      PDFName.of("V"),
      doc.context.register(doc.context.obj({ Type: "Sig" })),
    );
  }
  doc.getForm().acroForm.addField(fieldRef);
}

describe("readSignatureLayout", () => {
  test("lists only unsigned, visible signature fields with their page and box", async () => {
    const doc = await PDFDocument.create();
    const first = doc.addPage([612, 792]);
    const second = doc.addPage([612, 792]);
    addSignatureField(doc, second, "Approver", [300, 400, 460, 460]);
    addSignatureField(doc, first, "Witness", [460, 100, 300, 40], {
      asKid: true,
    });
    addSignatureField(doc, first, "AlreadySigned", [10, 10, 90, 50], {
      signed: true,
    });
    addSignatureField(doc, first, "Invisible", [0, 0, 0, 0]);

    const layout = await readSignatureLayout(await doc.save());

    expect(layout.emptyFields).toEqual([
      {
        name: "Approver",
        pageIndex: 1,
        box: { x: 300, y: 400, width: 160, height: 60 },
      },
      {
        name: "Witness",
        pageIndex: 0,
        box: { x: 300, y: 40, width: 160, height: 60 },
      },
    ]);
  });

  test("finds a field's page through the page annotations when /P is missing", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const second = doc.addPage([612, 792]);
    addSignatureField(doc, second, "NoLink", [10, 10, 110, 60], {
      linkPage: false,
    });

    const layout = await readSignatureLayout(await doc.save());

    expect(layout.emptyFields.map((field) => field.pageIndex)).toEqual([1]);
  });

  test("reports each page's crop box", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]).setCropBox(20, 30, 500, 600);

    const layout = await readSignatureLayout(await doc.save());

    expect(layout.emptyFields).toEqual([]);
    expect(layout.cropBoxes).toEqual([
      { x: 0, y: 0, width: 612, height: 792 },
      { x: 20, y: 30, width: 500, height: 600 },
    ]);
  });
});

describe("viewerRectToPdfBox", () => {
  test("flips the top-left viewer origin and adds the crop box offset", () => {
    expect(
      viewerRectToPdfBox(
        { x: 40, y: 100, width: 200, height: 50 },
        { x: 20, y: 30, width: 500, height: 600 },
      ),
    ).toEqual({ x: 60, y: 480, width: 200, height: 50 });
  });
});
