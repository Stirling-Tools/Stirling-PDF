import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import {
  createBlankPdf,
  defaultPageSizeFor,
} from "@editor/services/createPdf/newPdfDocuments";
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
    ["en-Latn-US", "LETTER"],
    ["zh_Hant_TW", "A4"],
    ["not a locale", "A4"],
  ])("%s prints on %s", (locale, size) => {
    expect(defaultPageSizeFor(locale)).toBe(size);
  });
  it("prints on A4 before a language has loaded", () => {
    expect(defaultPageSizeFor(undefined)).toBe("A4");
  });
});

describe("createBlankPdf", () => {
  it.each(["A4", "LETTER"] as const)("is one empty %s page", async (size) => {
    const file = await createBlankPdf(size);
    expect(file.name).toBe("Untitled.pdf");
    expect(file.type).toBe("application/pdf");
    const doc = await load(file);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual(PAGE_SIZES[size]);
  });
});
