import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import {
  NEW_PDF_ORIENTATIONS,
  NEW_PDF_PAGE_SIZES,
  createBlankPdf,
  createPdfFromTemplate,
  defaultPageSizeFor,
} from "@editor/services/createPdf/newPdfDocuments";
import {
  PDF_TEMPLATES,
  PDF_TEMPLATE_CATEGORIES,
} from "@editor/services/createPdf/pdfTemplates";
import { PAGE_SIZES } from "@editor/constants/pageSizeConstants";

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function load(file: File) {
  return PDFDocument.load(await readBytes(file));
}

describe("defaultPageSizeFor", () => {
  it.each([
    ["en-US", "LETTER"],
    ["en_CA", "LETTER"],
    ["en-GB", "A4"],
    ["de-DE", "A4"],
    ["fr", "A4"],
  ])("%s prints on %s", (locale, size) => {
    expect(defaultPageSizeFor(locale)).toBe(size);
  });
  it("prints on A4 before a language has loaded", () => {
    expect(defaultPageSizeFor(undefined)).toBe("A4");
  });
});

describe("createBlankPdf", () => {
  it.each(NEW_PDF_PAGE_SIZES)("is one empty %s page", async (size) => {
    const file = await createBlankPdf({ size, orientation: "portrait" });
    expect(file.name).toBe("Untitled.pdf");
    expect(file.type).toBe("application/pdf");
    const doc = await load(file);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual(PAGE_SIZES[size]);
  });

  it("swaps width and height for landscape", async () => {
    const doc = await load(
      await createBlankPdf({ size: "A4", orientation: "landscape" }),
    );
    expect(doc.getPage(0).getSize()).toEqual({
      width: PAGE_SIZES.A4.height,
      height: PAGE_SIZES.A4.width,
    });
  });
});

describe("PDF_TEMPLATES", () => {
  it("has unique ids in known categories", () => {
    const ids = PDF_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of PDF_TEMPLATES) {
      expect(PDF_TEMPLATE_CATEGORIES).toContain(template.category);
    }
  });
});

describe("createPdfFromTemplate", () => {
  const cases = PDF_TEMPLATES.flatMap((template) =>
    NEW_PDF_ORIENTATIONS.map(
      (orientation) => [template.id, orientation, template] as const,
    ),
  );

  it.each(cases)(
    "%s fits its pages in %s",
    async (_id, orientation, template) => {
      const small = await createPdfFromTemplate(template, {
        size: "A5",
        orientation,
      });
      expect(small.name).toBe(`${template.title}.pdf`);
      expect((await load(small)).getTitle()).toBe(template.title);
      const letter = await load(
        await createPdfFromTemplate(template, { size: "LETTER", orientation }),
      );
      const expectedPages = template.body.split("@page").length;
      expect(letter.getPageCount()).toBe(expectedPages);
      const { width, height } = PAGE_SIZES.LETTER;
      expect(letter.getPage(0).getSize()).toEqual(
        orientation === "landscape"
          ? { width: height, height: width }
          : { width, height },
      );
    },
  );

  it("adds a page when the content runs past the bottom margin", async () => {
    const body = Array.from({ length: 80 }, (_, i) => `Line ${i}`).join("\n");
    const file = await createPdfFromTemplate(
      { id: "long", category: "paper", title: "Long", body },
      { size: "A5", orientation: "portrait" },
    );
    expect((await load(file)).getPageCount()).toBeGreaterThan(1);
  });
});
