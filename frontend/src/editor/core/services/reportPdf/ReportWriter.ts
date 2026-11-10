import {
  PdfiumDocument,
  PdfiumFont,
  PdfiumPage,
  type PdfiumColor,
} from "@editor/services/pdfiumDocBuilder";
import { colorPalette } from "@editor/services/reportPdf/reportPalette";
import { wrapText } from "@editor/services/reportPdf/reportText";

/** US Letter in PDF points, the page every generated report uses. */
export const LETTER_PAGE = { width: 612, height: 792 } as const;

/** Page geometry in PDF points. The footer sits halfway into the bottom margin. */
export interface ReportLayout {
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
}

export interface TextStyle {
  font: PdfiumFont;
  size: number;
  color: PdfiumColor;
}

export interface ReportWriterOptions {
  layout: ReportLayout;
  regular: PdfiumFont;
  bold: PdfiumFont;
  /** Drawn bottom-left on every page. */
  footerText: string;
  /** Drawn bottom-right on every page, given the one-based page number. */
  pageLabel: (pageNumber: number) => string;
}

const LINE_HEIGHT = 1.35;

/**
 * Lays a report down a sequence of pages, starting a new page whenever the next block would run
 * into the footer. y is the top of the next block, in PDF points from the page bottom; callers
 * move it down as they draw.
 */
export class ReportWriter {
  y = 0;
  readonly layout: ReportLayout;
  private page!: PdfiumPage;
  private continuationTitle = "";
  private readonly doc: PdfiumDocument;
  private readonly options: ReportWriterOptions;

  constructor(doc: PdfiumDocument, options: ReportWriterOptions) {
    this.doc = doc;
    this.options = options;
    this.layout = options.layout;
  }

  get font() {
    return this.options.regular;
  }

  get boldFont() {
    return this.options.bold;
  }

  get currentPage() {
    return this.page;
  }

  get contentWidth() {
    return this.layout.pageWidth - this.layout.marginX * 2;
  }

  /** Starts a new page; pages that `ensure` adds after it open with `continuationTitle`. */
  startSection(continuationTitle: string) {
    this.continuationTitle = continuationTitle;
    this.addPage();
  }

  /** Moves to a new page when fewer than `height` points remain above the footer. */
  ensure(height: number) {
    if (this.y - height < this.layout.marginBottom) {
      this.addPage();
      this.text(this.continuationTitle, this.layout.marginX, {
        font: this.options.bold,
        size: 9,
        color: colorPalette.textMuted,
      });
      this.y -= 10;
    }
  }

  /** Draws one line with its top at the current y and moves below it. */
  text(value: string, x: number, style: TextStyle) {
    this.page.drawText(value, {
      x,
      y: this.y - style.size,
      size: style.size,
      font: style.font,
      color: style.color,
    });
    this.y -= style.size * LINE_HEIGHT;
  }

  /** Wraps `value` to `width`, breaking pages between lines. */
  paragraph(value: string, x: number, width: number, style: TextStyle) {
    for (const line of wrapText(value, style.font, style.size, width)) {
      this.ensure(style.size * LINE_HEIGHT);
      this.text(line, x, style);
    }
  }

  /** Draws one line ending at `right`, leaving y where it was. */
  textRight(value: string, right: number, style: TextStyle) {
    const width = style.font.widthOfTextAtSize(value, style.size);
    this.page.drawText(value, {
      x: right - width,
      y: this.y - style.size,
      size: style.size,
      font: style.font,
      color: style.color,
    });
  }

  rect(
    x: number,
    top: number,
    width: number,
    height: number,
    color: PdfiumColor,
    borderColor?: PdfiumColor,
  ) {
    this.page.drawRectangle({
      x,
      y: top - height,
      width,
      height,
      color,
      borderColor,
      borderWidth: borderColor ? 0.75 : undefined,
    });
  }

  /** A full-width divider at `y`. */
  rule(y: number) {
    this.page.drawLine({
      start: { x: this.layout.marginX, y },
      end: { x: this.layout.marginX + this.contentWidth, y },
      thickness: 0.75,
      color: colorPalette.boxBorder,
    });
  }

  private addPage() {
    const { pageWidth, pageHeight, marginX, marginTop, marginBottom } =
      this.layout;
    this.page = this.doc.addPage([pageWidth, pageHeight]);
    this.y = pageHeight - marginTop;
    const footer: TextStyle = {
      font: this.options.regular,
      size: 8,
      color: colorPalette.textMuted,
    };
    const footerY = marginBottom / 2;
    this.page.drawText(this.options.footerText, {
      x: marginX,
      y: footerY,
      ...footer,
    });
    const pageLabel = this.options.pageLabel(this.doc.getPageCount());
    this.page.drawText(pageLabel, {
      x:
        marginX +
        this.contentWidth -
        this.options.regular.widthOfTextAtSize(pageLabel, footer.size),
      y: footerY,
      ...footer,
    });
  }
}
