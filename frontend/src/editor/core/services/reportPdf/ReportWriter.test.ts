import { describe, expect, it } from "vitest";
import {
  rgb,
  type PdfiumDocument,
  type PdfiumFont,
} from "@editor/services/pdfiumDocBuilder";
import {
  LETTER_PAGE,
  ReportWriter,
  type ReportLayout,
} from "@editor/services/reportPdf/ReportWriter";

interface DrawnText {
  page: number;
  text: string;
  x: number;
  y: number;
}

/** Records drawn text per page; each character is half the font size wide. */
function fakeDocument() {
  const drawn: DrawnText[] = [];
  let pages = 0;
  const doc = {
    addPage: () => {
      const page = ++pages;
      return {
        drawText: (text: string, options: { x: number; y: number }) =>
          drawn.push({ page, text, x: options.x, y: options.y }),
        drawRectangle: () => {},
        drawLine: () => {},
      };
    },
    getPageCount: () => pages,
  };
  return {
    doc: doc as unknown as PdfiumDocument,
    drawn,
    pageCount: () => pages,
  };
}

const font = {
  widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
} as unknown as PdfiumFont;

const BLACK = rgb(0, 0, 0);

const layout: ReportLayout = {
  pageWidth: LETTER_PAGE.width,
  pageHeight: LETTER_PAGE.height,
  marginX: 50,
  marginTop: 40,
  marginBottom: 60,
};

function writerFor(doc: PdfiumDocument) {
  return new ReportWriter(doc, {
    layout,
    regular: font,
    bold: font,
    footerText: "Footer",
    pageLabel: (n) => `Page ${n}`,
  });
}

describe("ReportWriter", () => {
  it("opens a section on a new page below the top margin, with its footer", () => {
    const { doc, drawn } = fakeDocument();
    const writer = writerFor(doc);

    writer.startSection("Report (continued)");

    expect(writer.y).toBe(layout.pageHeight - layout.marginTop);
    expect(drawn).toContainEqual({ page: 1, text: "Footer", x: 50, y: 30 });
    const label = drawn.find((d) => d.text === "Page 1");
    expect(label).toBeDefined();
    // Right-aligned: "Page 1" is 6 chars at size 8, so 24pt wide.
    expect(label!.x).toBe(layout.pageWidth - layout.marginX - 24);
  });

  it("moves below each line by the line height", () => {
    const { doc } = fakeDocument();
    const writer = writerFor(doc);
    writer.startSection("");
    const top = writer.y;

    writer.text("Hello", 50, { font, size: 10, color: BLACK });

    expect(writer.y).toBeCloseTo(top - 13.5);
  });

  it("breaks a long paragraph onto a new page that opens with the continuation title", () => {
    const { doc, drawn, pageCount } = fakeDocument();
    const writer = writerFor(doc);
    writer.startSection("Report (continued)");
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");

    writer.paragraph(words, 50, writer.contentWidth, {
      font,
      size: 10,
      color: BLACK,
    });

    expect(pageCount()).toBeGreaterThan(1);
    expect(drawn).toContainEqual(
      expect.objectContaining({ page: 2, text: "Report (continued)" }),
    );
    expect(drawn).toContainEqual(
      expect.objectContaining({ page: 2, text: "Page 2" }),
    );
    const body = drawn.filter((d) => d.text.startsWith("word"));
    expect(body.every((d) => d.y >= layout.marginBottom - 10)).toBe(true);
  });

  it("stays on the page while the block fits above the footer", () => {
    const { doc, pageCount } = fakeDocument();
    const writer = writerFor(doc);
    writer.startSection("");

    writer.ensure(writer.y - layout.marginBottom);

    expect(pageCount()).toBe(1);
  });
});
