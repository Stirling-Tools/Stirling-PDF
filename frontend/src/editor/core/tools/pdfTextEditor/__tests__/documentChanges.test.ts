// @vitest-environment node
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { readFileStructure } from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
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
  StandardFonts,
} from "@cantoo/pdf-lib";
import {
  DocumentChangeRefused,
  pageChangeCommand,
  type DocumentChange,
} from "@editor/tools/pdfTextEditor/util/documentChanges";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
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

async function saved(doc: EditorDocument) {
  return new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
}

async function applyDocumentChange(bytes: Uint8Array, change: DocumentChange) {
  const doc = await EditorDocument.open(bytes);
  try {
    const { command, focusPage } = pageChangeCommand(doc, change);
    command.apply(doc);
    return { bytes: await saved(doc), focusPage: doc.positionOf(focusPage) };
  } finally {
    doc.dispose();
  }
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

  test("undo takes a page change back without reopening the document", async () => {
    const doc = await EditorDocument.open(
      await pdfOf([
        [595, 842],
        [842, 595],
      ]),
    );
    try {
      const changes: DocumentChange[] = [
        { kind: "addPage", after: 0 },
        { kind: "duplicatePage", page: 1 },
        { kind: "deletePage", page: 0 },
        {
          kind: "pageSetup",
          pages: "all",
          size: "LETTER",
          orientation: "portrait",
        },
      ];
      for (const change of changes) {
        const { command } = pageChangeCommand(doc, change);
        command.apply(doc);
        command.revert(doc);
      }
      expect(doc.displayOrder()).toEqual([0, 1]);
      const out = await open(await saved(doc));
      expect(out.getPages().map((page) => page.getSize())).toEqual([
        { width: 595, height: 842 },
        { width: 842, height: 595 },
      ]);
    } finally {
      doc.dispose();
    }
  });

  test("saves the pages in the order shown, without the ones deleted", async () => {
    const doc = await EditorDocument.open(
      await pdfOf([
        [595, 842],
        [842, 595],
        [400, 300],
      ]),
    );
    try {
      for (const change of [
        { kind: "deletePage", page: 1 },
        { kind: "duplicatePage", page: 2 },
        { kind: "addPage", after: 0 },
      ] satisfies DocumentChange[])
        pageChangeCommand(doc, change).command.apply(doc);
      const out = await open(await saved(doc));
      expect(out.getPages().map((page) => page.getSize())).toEqual([
        { width: 595, height: 842 },
        { width: 595, height: 842 },
        { width: 400, height: 300 },
        { width: 400, height: 300 },
      ]);
    } finally {
      doc.dispose();
    }
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

const fixture = async (name: string) =>
  new Uint8Array(await readFile(path.join(FIXTURES, name)));

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

test("refuses a page change while a save is running", async () => {
  const doc = await EditorDocument.open(
    await pdfOf([
      [595, 842],
      [595, 842],
    ]),
  );
  try {
    const saving = saved(doc);
    expect(() =>
      pageChangeCommand(doc, { kind: "deletePage", page: 1 }),
    ).toThrow(DocumentChangeRefused);
    expect((await open(await saving)).getPageCount()).toBe(2);
    expect(() =>
      pageChangeCommand(doc, { kind: "deletePage", page: 1 }),
    ).not.toThrow();
  } finally {
    doc.dispose();
  }
});

test("editing a duplicated tagged page leaves the original page's tags alone", async () => {
  const bytes = await fixture("tagged-sample.pdf");
  const before = await readFileStructure(bytes);
  const doc = await EditorDocument.open(bytes);
  try {
    const { command, focusPage } = pageChangeCommand(doc, {
      kind: "duplicatePage",
      page: 0,
    });
    command.apply(doc);
    const copy = doc.page(focusPage);
    PdfiumTextReader.populate(doc, copy);
    const run = copy.runs.find((r) => r.text.startsWith("Quarterly"))!;
    new EditTextCommand({
      pageIndex: focusPage,
      runId: run.id,
      nextText: "Copied report",
    }).apply(doc);
    const out = await saved(doc);
    const pages = await PDFDocument.load(out);
    expect(
      pages.getPage(1).node.get(PDFName.of("StructParents")),
    ).toBeUndefined();
    const after = await readFileStructure(out);
    expect(
      after?.blocks.filter((b) => b.pageIndex === 0).map((b) => b.type),
    ).toEqual(
      before?.blocks.filter((b) => b.pageIndex === 0).map((b) => b.type),
    );
  } finally {
    doc.dispose();
  }
});

test("undoing page setup restores a page whose boxes it inherited", async () => {
  const source = await PDFDocument.create();
  source.addPage([612, 1000]);
  source.getPage(0).node.delete(PDFName.of("MediaBox"));
  source.catalog
    .lookup(PDFName.of("Pages"), PDFDict)
    .set(PDFName.of("MediaBox"), source.context.obj([0, 0, 612, 1000]));
  const doc = await EditorDocument.open(await source.save());
  try {
    const { command } = pageChangeCommand(doc, {
      kind: "pageSetup",
      pages: "all",
      size: "A5",
      orientation: "portrait",
    });
    command.apply(doc);
    expect(Math.round(doc.page(0).height)).not.toBe(1000);
    command.revert(doc);
    expect([
      Math.round(doc.page(0).width),
      Math.round(doc.page(0).height),
    ]).toEqual([612, 1000]);
    const out = await open(await saved(doc));
    expect(out.getPage(0).getSize()).toEqual({ width: 612, height: 1000 });
  } finally {
    doc.dispose();
  }
});
