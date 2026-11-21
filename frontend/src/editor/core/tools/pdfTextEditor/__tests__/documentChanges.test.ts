// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
} from "@cantoo/pdf-lib";
import {
  applyDocumentChange,
  DocumentChangeRefused,
} from "@editor/tools/pdfTextEditor/util/documentChanges";
import { FIELD_SIZES } from "@editor/tools/pdfTextEditor/util/formFieldChanges";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  FIXTURES,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();

async function pdfOf(pages: Array<[number, number]>) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: h - 60, size: 12, font });
  });
  return doc.save();
}

async function open(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

describe("page changes", () => {
  test("adds a page the size of the one before it, after it", async () => {
    const changed = await applyDocumentChange(
      await pdfOf([
        [595, 842],
        [842, 595],
      ]),
      { kind: "addPage", after: 1 },
    );
    const doc = await open(changed.bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(2).getSize()).toEqual({ width: 842, height: 595 });
    expect(changed.focusPage).toBe(2);
  });

  test("duplicates a page in place, dropping its claim on the structure tree", async () => {
    const source = await PDFDocument.load(await pdfOf([[595, 842]]));
    source
      .getPage(0)
      .node.set(PDFName.of("StructParents"), source.context.obj(0));
    const changed = await applyDocumentChange(await source.save(), {
      kind: "duplicatePage",
      page: 0,
    });
    const doc = await open(changed.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(
      doc.getPage(1).node.get(PDFName.of("StructParents")),
    ).toBeUndefined();
    expect(doc.getPage(0).node.get(PDFName.of("StructParents"))).toBeDefined();
  });

  test("deletes a page but never the last one", async () => {
    const changed = await applyDocumentChange(
      await pdfOf([
        [595, 842],
        [595, 842],
      ]),
      { kind: "deletePage", page: 1 },
    );
    expect((await open(changed.bytes)).getPageCount()).toBe(1);
    expect(changed.focusPage).toBe(0);
    await expect(
      applyDocumentChange(changed.bytes, { kind: "deletePage", page: 0 }),
    ).rejects.toBeInstanceOf(DocumentChangeRefused);
  });

  test("page setup resizes every page and keeps the content at the top", async () => {
    const changed = await applyDocumentChange(
      await pdfOf([
        [595, 842],
        [595, 842],
      ]),
      {
        kind: "pageSetup",
        pages: "all",
        size: "LETTER",
        orientation: "landscape",
      },
    );
    const doc = await open(changed.bytes);
    for (const page of doc.getPages()) {
      expect(page.getSize()).toEqual({ width: 792, height: 612 });
      expect(page.getCropBox()).toMatchObject({ width: 792, height: 612 });
    }
  });
  test("page setup on the current size only turns each page, and shows the page asked for", async () => {
    const changed = await applyDocumentChange(
      await pdfOf([
        [400, 300],
        [200, 500],
      ]),
      {
        kind: "pageSetup",
        pages: "all",
        size: "current",
        orientation: "portrait",
        inView: 1,
      },
    );
    const doc = await open(changed.bytes);
    expect(doc.getPages().map((page) => page.getSize())).toEqual([
      { width: 300, height: 400 },
      { width: 200, height: 500 },
    ]);
    expect(changed.focusPage).toBe(1);
  });

  test("refuses to delete the last page with a reason the caller can name", async () => {
    await expect(
      applyDocumentChange(await pdfOf([[595, 842]]), {
        kind: "deletePage",
        page: 0,
      }),
    ).rejects.toMatchObject({ reason: "lastPage" });
  });
});

describe("form fields", () => {
  test.each(["text", "checkbox", "signature"] as const)(
    "adds a %s field with its top-left corner where the page was clicked",
    async (field) => {
      const once = await applyDocumentChange(await pdfOf([[595, 842]]), {
        kind: "addField",
        page: 0,
        field,
        x: 100,
        y: 700,
      });
      const twice = await applyDocumentChange(once.bytes, {
        kind: "addField",
        page: 0,
        field,
        x: 100,
        y: 600,
      });
      const fields = (await open(twice.bytes)).getForm().getFields();
      expect(fields.map((f) => f.getName())).toHaveLength(2);
      expect(new Set(fields.map((f) => f.getName())).size).toBe(2);
      const [first] = fields[0].acroField.getWidgets();
      const rect = first.getRectangle();
      const { width, height } = FIELD_SIZES[field];
      expect(rect.x + rect.width / 2).toBeCloseTo(100 + width / 2);
      expect(rect.y + rect.height / 2).toBeCloseTo(700 - height / 2);
    },
  );
});

const fixture = async (name: string) =>
  new Uint8Array(await readFile(path.join(FIXTURES, name)));

test.each([
  "form-fields-sample.pdf",
  "form-compressed-catalog.pdf",
  "tagged-sample.pdf",
])(
  "%s takes every field kind next to the fields it already has",
  async (name) => {
    let bytes: Uint8Array = await fixture(name);
    const before = (await PDFDocument.load(bytes)).getForm().getFields().length;
    for (const field of ["text", "checkbox", "signature"] as const)
      bytes = (
        await applyDocumentChange(bytes, {
          kind: "addField",
          page: 0,
          field,
          x: 40,
          y: 120,
        })
      ).bytes;
    const names = (await PDFDocument.load(bytes))
      .getForm()
      .getFields()
      .map((f) => f.getName());
    expect(names).toHaveLength(before + 3);
    expect(new Set(names).size).toBe(names.length);
    const reopened = await EditorDocument.open(bytes);
    try {
      PdfiumTextReader.populate(reopened, reopened.page(0));
      expect(
        reopened.page(0).annotations.filter((a) => a.kind === "widget").length,
      ).toBeGreaterThanOrEqual(3);
    } finally {
      reopened.dispose();
    }
  },
);

test("a duplicated tagged page leaves the copy out of the structure tree", async () => {
  const bytes = await fixture("tagged-sample.pdf");
  const original = (await PDFDocument.load(bytes))
    .getPage(0)
    .node.get(PDFName.of("StructParents"));
  expect(original).toBeDefined();
  const changed = await applyDocumentChange(bytes, {
    kind: "duplicatePage",
    page: 0,
  });
  const doc = await PDFDocument.load(changed.bytes);
  expect(doc.getPageCount()).toBe(
    (await PDFDocument.load(bytes)).getPageCount() + 1,
  );
  expect(doc.getPage(1).node.get(PDFName.of("StructParents"))).toBeUndefined();
  expect(doc.getPage(0).node.get(PDFName.of("StructParents"))).toBeDefined();
});

async function shownAt(bytes: Uint8Array, startsWith: string) {
  const doc = await EditorDocument.open(bytes);
  try {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    const { x, y, width, height } = page.runs.find((r) =>
      r.text.startsWith(startsWith),
    )!.bounds;
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ].map(([px, py]) => page.display.apply(px, py));
    return {
      left: Math.min(...corners.map((c) => c.x)),
      topGap: page.display.displayHeight - Math.max(...corners.map((c) => c.y)),
    };
  } finally {
    doc.dispose();
  }
}

test("page setup keeps text at the same distance from the top of a taller page", async () => {
  const bytes = await fixture("paragraph-sample.pdf");
  const changed = await applyDocumentChange(bytes, {
    kind: "pageSetup",
    pages: "all",
    size: "A4",
    orientation: "portrait",
  });
  const before = await shownAt(bytes, "Heading");
  const after = await shownAt(changed.bytes, "Heading");
  expect(after.topGap).toBeCloseTo(before.topGap, 0);
  expect(after.left).toBeCloseTo(before.left, 0);
});

test.each([90, 180, 270])(
  "page setup keeps the corner shown as top-left on a page turned %i degrees",
  async (angle) => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    const page = source.addPage(angle === 180 ? [612, 792] : [792, 612]);
    page.drawText("Marked", { x: 100, y: 100, size: 12, font });
    page.setRotation(degrees(angle));
    const bytes = await source.save();
    const changed = await applyDocumentChange(bytes, {
      kind: "pageSetup",
      pages: "all",
      size: "A4",
      orientation: "portrait",
    });
    const before = await shownAt(bytes, "Marked");
    const after = await shownAt(changed.bytes, "Marked");
    expect(after.left).toBeCloseTo(before.left, 0);
    expect(after.topGap).toBeCloseTo(before.topGap, 0);
  },
);

test("page setup sizes a quarter-turned page by the shape it is shown in", async () => {
  const bytes = await fixture("rotated-pages.pdf");
  const source = await PDFDocument.load(bytes);
  const turned = source
    .getPages()
    .findIndex((p) => p.getRotation().angle % 180 === 90);
  expect(turned).toBeGreaterThanOrEqual(0);
  const changed = await applyDocumentChange(bytes, {
    kind: "pageSetup",
    pages: turned,
    size: "A4",
    orientation: "portrait",
  });
  const page = (await PDFDocument.load(changed.bytes)).getPage(turned);
  const { width, height } = page.getSize();
  expect([Math.round(height), Math.round(width)]).toEqual([595, 842]);
});

test.each(["text", "signature"] as const)(
  "a new %s field never takes a name the form already has, however it is written",
  async (field) => {
    const source = await PDFDocument.create();
    const page = source.addPage([400, 300]);
    const form = source.getForm();
    form.createTextField("Text1").addToPage(page, { x: 10, y: 10 });
    form.createTextField("Signature1").addToPage(page, { x: 10, y: 60 });
    const changed = await applyDocumentChange(await source.save(), {
      kind: "addField",
      page: 0,
      field,
      x: 100,
      y: 200,
    });
    const names = (await PDFDocument.load(changed.bytes))
      .getForm()
      .getFields()
      .map((f) => f.getName());
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
  },
);

test("page setup keeps the visible top when the boxes are inherited or cropped", async () => {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const page = source.addPage([612, 1000]);
  page.drawText("Top line", { x: 140, y: 700, size: 12, font });
  page.setCropBox(100, 100, 400, 650);
  page.node.delete(PDFName.of("MediaBox"));
  source.catalog
    .lookup(PDFName.of("Pages"), PDFDict)
    .set(PDFName.of("MediaBox"), source.context.obj([0, 0, 612, 1000]));
  const bytes = await source.save();
  const changed = await applyDocumentChange(bytes, {
    kind: "pageSetup",
    pages: "all",
    size: "A4",
    orientation: "portrait",
  });
  const before = await shownAt(bytes, "Top line");
  const after = await shownAt(changed.bytes, "Top line");
  expect(after.left).toBeCloseTo(before.left, 0);
  expect(after.topGap).toBeCloseTo(before.topGap, 0);
});

test("page setup leaves every annotation coordinate on the content it marks", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([595, 842]);
  const highlight = source.context.obj({
    Type: "Annot",
    Subtype: "Highlight",
    Rect: [100, 700, 200, 720],
    QuadPoints: [100, 720, 200, 720, 100, 700, 200, 700],
  });
  page.node.set(
    PDFName.of("Annots"),
    source.context.obj([source.context.register(highlight)]),
  );
  const changed = await applyDocumentChange(await source.save(), {
    kind: "pageSetup",
    pages: "all",
    size: "LETTER",
    orientation: "portrait",
  });
  const out = (await PDFDocument.load(changed.bytes)).getPage(0);
  const [annot] = out.node.Annots()!.asArray();
  const dict = out.doc.context.lookup(annot, PDFDict);
  const numbers = (key: string) =>
    dict
      .lookup(PDFName.of(key), PDFArray)
      .asArray()
      .map((n) => (n as PDFNumber).asNumber());
  const media = out.getMediaBox();
  const shift = media.y + media.height - 842;
  expect(numbers("Rect")).toEqual([100, 700, 200, 720]);
  expect(numbers("QuadPoints")).toEqual([
    100, 720, 200, 720, 100, 700, 200, 700,
  ]);
  expect(shift).toBeCloseTo(0, 0);
});

test.each(["text", "checkbox"] as const)(
  "a new %s field is drawn as a printable box other viewers can fill",
  async (field) => {
    const changed = await applyDocumentChange(await pdfOf([[595, 842]]), {
      kind: "addField",
      page: 0,
      field,
      x: 100,
      y: 700,
    });
    const doc = await PDFDocument.load(changed.bytes);
    const [widget] = doc.getForm().getFields()[0].acroField.getWidgets();
    expect(widget.getFlags() & 4).toBe(4);
    const border = widget
      .getOrCreateAppearanceCharacteristics()
      .getBorderColor();
    expect(border?.map((c) => Math.round(c * 255))).toEqual([115, 115, 128]);
    if (field === "text")
      expect(
        widget.getDefaultAppearance() ??
          doc.getForm().getFields()[0].acroField.getDefaultAppearance(),
      ).toMatch(/Tf/);
    const normal = doc.context
      .lookup(widget.dict.get(PDFName.of("AP")), PDFDict)
      .get(PDFName.of("N"));
    const resolved = doc.context.lookup(normal);
    const stream =
      resolved instanceof PDFRawStream
        ? resolved
        : doc.context.lookup((resolved as PDFDict).values()[0]);
    if (!(stream instanceof PDFRawStream)) throw new Error("no appearance");
    expect(stream.getContents().length).toBeGreaterThan(0);
  },
);

test("page setup moves the trim, bleed and art boxes to the new paper", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([612, 792]);
  page.setTrimBox(0, 0, 612, 792);
  page.setBleedBox(0, 0, 612, 792);
  const changed = await applyDocumentChange(await source.save(), {
    kind: "pageSetup",
    pages: "all",
    size: "A5",
    orientation: "portrait",
  });
  const out = (await PDFDocument.load(changed.bytes)).getPage(0);
  const media = out.getMediaBox();
  expect(out.getTrimBox()).toEqual(media);
  expect(out.getBleedBox()).toEqual(media);
  expect(out.node.get(PDFName.of("ArtBox"))).toBeUndefined();
});
