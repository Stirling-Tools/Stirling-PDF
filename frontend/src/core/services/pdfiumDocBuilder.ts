/**
 * pdfiumDocBuilder — High-level PDF document builder powered by PDFium WASM.
 *
 * Provides an API surface compatible with common pdf-lib patterns
 * (drawText, drawRectangle, drawLine, drawImage, font metrics, etc.)
 * so that code previously using pdf-lib for PDF *generation* can be
 * migrated with minimal changes.
 *
 * Used by the signature validation report system.
 */
import {
  getPdfiumModule,
  writeUtf16,
  saveRawDocument,
} from "@app/services/pdfiumService";
import { embedBitmapImageOnPage } from "@app/utils/pdfiumBitmapUtils";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

// ---------------------------------------------------------------------------
// Color type (replaces pdf-lib's `rgb()`)
// ---------------------------------------------------------------------------

export interface PdfiumColor {
  _r: number;
  _g: number;
  _b: number;
}

/**
 * Create an RGB color (each component 0–1). Drop-in replacement for pdf-lib's `rgb()`.
 */
export function rgb(r: number, g: number, b: number): PdfiumColor {
  return { _r: r, _g: g, _b: b };
}

function colorToRGBA(c: PdfiumColor): [number, number, number, number] {
  return [
    Math.round(c._r * 255),
    Math.round(c._g * 255),
    Math.round(c._b * 255),
    255,
  ];
}

// ---------------------------------------------------------------------------
// Font abstraction
// ---------------------------------------------------------------------------

/** Standard PDF font names matching pdf-lib's StandardFonts enum. */
export const StandardFonts = {
  Helvetica: "Helvetica",
  HelveticaBold: "Helvetica-Bold",
  HelveticaOblique: "Helvetica-Oblique",
  HelveticaBoldOblique: "Helvetica-BoldOblique",
  Courier: "Courier",
  CourierBold: "Courier-Bold",
  TimesRoman: "Times-Roman",
  TimesBold: "Times-Bold",
} as const;

export class PdfiumFont {
  readonly name: string;
  private _canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private _ctx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Measure the width of `text` at the given `fontSize` (in PDF points).
   * Uses canvas font metrics as a reliable cross-browser measurement.
   */
  widthOfTextAtSize(text: string, fontSize: number): number {
    const ctx = this._getCtx();
    ctx.font = `${fontSize}px "${this._cssFontFamily()}"`;
    return ctx.measureText(text).width;
  }

  /**
   * Returns the line height for a given font size (approximation).
   */
  heightAtSize(fontSize: number): number {
    return fontSize * 1.2;
  }

  /** Map PDF font name to a CSS font-family for canvas measurement. */
  private _cssFontFamily(): string {
    if (this.name.startsWith("Helvetica"))
      return "Helvetica, Arial, sans-serif";
    if (this.name.startsWith("Courier")) return "Courier, monospace";
    if (this.name.startsWith("Times")) return "Times New Roman, serif";
    return "sans-serif";
  }

  private _getCtx():
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D {
    if (this._ctx) return this._ctx;
    if (typeof OffscreenCanvas !== "undefined") {
      this._canvas = new OffscreenCanvas(1, 1);
      this._ctx = this._canvas.getContext("2d")!;
    } else {
      this._canvas = document.createElement("canvas");
      this._ctx = this._canvas.getContext("2d")!;
    }
    return this._ctx;
  }
}

// ---------------------------------------------------------------------------
// Image abstraction
// ---------------------------------------------------------------------------

export class PdfiumImage {
  readonly width: number;
  readonly height: number;
  /** Raw RGBA pixel data */
  readonly _rgba: Uint8Array;

  constructor(rgba: Uint8Array, width: number, height: number) {
    this._rgba = rgba;
    this.width = width;
    this.height = height;
  }

  /** Returns scaled dimensions (matches pdf-lib's `PDFImage.scale()`). */
  scale(factor: number): { width: number; height: number } {
    return { width: this.width * factor, height: this.height * factor };
  }

  /** Scale to fit within maxWidth × maxHeight preserving aspect ratio (matches pdf-lib's `PDFImage.scaleToFit()`). */
  scaleToFit(
    maxWidth: number,
    maxHeight: number,
  ): { width: number; height: number } {
    const ratio = Math.min(maxWidth / this.width, maxHeight / this.height, 1);
    return { width: this.width * ratio, height: this.height * ratio };
  }
}

// ---------------------------------------------------------------------------
// Page abstraction
// ---------------------------------------------------------------------------

export interface DrawTextOptions {
  x: number;
  y: number;
  size: number;
  font?: PdfiumFont;
  color?: PdfiumColor;
}

export interface DrawRectangleOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: PdfiumColor;
  borderColor?: PdfiumColor;
  borderWidth?: number;
  opacity?: number;
}

export interface DrawImageOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawLineOptions {
  start: { x: number; y: number };
  end: { x: number; y: number };
  thickness?: number;
  color?: PdfiumColor;
}

export class PdfiumPage {
  readonly _m: WrappedPdfiumModule;
  readonly _docPtr: number;
  readonly _pagePtr: number;
  readonly width: number;
  readonly height: number;

  constructor(
    m: WrappedPdfiumModule,
    docPtr: number,
    pagePtr: number,
    width: number,
    height: number,
  ) {
    this._m = m;
    this._docPtr = docPtr;
    this._pagePtr = pagePtr;
    this.width = width;
    this.height = height;
  }

  /**
   * Draw text on the page. API compatible with pdf-lib's `PDFPage.drawText()`.
   */
  drawText(text: string, options: DrawTextOptions): void {
    const { x, y, size, font, color } = options;
    const m = this._m;
    const fontName = font?.name ?? "Helvetica";

    const textObjPtr = m.FPDFPageObj_NewTextObj(this._docPtr, fontName, size);
    if (!textObjPtr) return;

    // Set text content (UTF-16)
    const textPtr = writeUtf16(m, text);
    m.FPDFText_SetText(textObjPtr, textPtr);
    m.pdfium.wasmExports.free(textPtr);

    // Set color
    if (color) {
      const [r, g, b, a] = colorToRGBA(color);
      m.FPDFPageObj_SetFillColor(textObjPtr, r, g, b, a);
    }

    // Position the text object
    // FPDFPageObj_Transform(obj, a, b, c, d, e, f) — applies affine transform
    // Identity + translate: a=1, b=0, c=0, d=1, e=x, f=y
    m.FPDFPageObj_Transform(textObjPtr, 1, 0, 0, 1, x, y);

    m.FPDFPage_InsertObject(this._pagePtr, textObjPtr);
  }

  /**
   * Draw a rectangle on the page. API compatible with pdf-lib's `PDFPage.drawRectangle()`.
   */
  drawRectangle(options: DrawRectangleOptions): void {
    const {
      x,
      y,
      width,
      height,
      color,
      borderColor,
      borderWidth = 1,
    } = options;
    const m = this._m;

    const pathPtr = m.FPDFPageObj_CreateNewPath(x, y);
    if (!pathPtr) return;

    m.FPDFPath_LineTo(pathPtr, x + width, y);
    m.FPDFPath_LineTo(pathPtr, x + width, y + height);
    m.FPDFPath_LineTo(pathPtr, x, y + height);
    m.FPDFPath_Close(pathPtr);

    let hasFill = false;
    let hasStroke = false;

    if (color) {
      const [r, g, b, a] = colorToRGBA(color);
      m.FPDFPageObj_SetFillColor(pathPtr, r, g, b, a);
      hasFill = true;
    }

    if (borderColor) {
      const [r, g, b, a] = colorToRGBA(borderColor);
      m.FPDFPageObj_SetStrokeColor(pathPtr, r, g, b, a);
      m.FPDFPageObj_SetStrokeWidth(pathPtr, borderWidth);
      hasStroke = true;
    }

    // Fill mode: 0 = none, 1 = alternate, 2 = winding
    const fillMode = hasFill ? 1 : 0;
    m.FPDFPath_SetDrawMode(pathPtr, fillMode, hasStroke);

    m.FPDFPage_InsertObject(this._pagePtr, pathPtr);
  }

  /**
   * Draw a line on the page. API compatible with pdf-lib's `PDFPage.drawLine()`.
   */
  drawLine(options: DrawLineOptions): void {
    const { start, end, thickness = 1, color } = options;
    const m = this._m;

    const pathPtr = m.FPDFPageObj_CreateNewPath(start.x, start.y);
    if (!pathPtr) return;

    m.FPDFPath_LineTo(pathPtr, end.x, end.y);

    if (color) {
      const [r, g, b, a] = colorToRGBA(color);
      m.FPDFPageObj_SetStrokeColor(pathPtr, r, g, b, a);
    }
    m.FPDFPageObj_SetStrokeWidth(pathPtr, thickness);

    // fillMode=0 (no fill), stroke=true
    m.FPDFPath_SetDrawMode(pathPtr, 0, true);

    m.FPDFPage_InsertObject(this._pagePtr, pathPtr);
  }

  /**
   * Draw an image on the page. API compatible with pdf-lib's `PDFPage.drawImage()`.
   */
  drawImage(image: PdfiumImage, options: DrawImageOptions): void {
    const { x, y, width, height } = options;
    embedBitmapImageOnPage(
      this._m,
      this._docPtr,
      this._pagePtr,
      { rgba: image._rgba, width: image.width, height: image.height },
      x,
      y,
      width,
      height,
    );
  }

  /** Finalize the page content stream. Called internally by PdfiumDocument. */
  _generateContent(): void {
    this._m.FPDFPage_GenerateContent(this._pagePtr);
  }

  /** Close the page pointer. Called internally by PdfiumDocument. */
  _close(): void {
    this._m.FPDF_ClosePage(this._pagePtr);
  }
}

// ---------------------------------------------------------------------------
// Document abstraction
// ---------------------------------------------------------------------------

export class PdfiumDocument {
  readonly _m: WrappedPdfiumModule;
  readonly _docPtr: number;
  private _pages: PdfiumPage[] = [];
  private _fonts: Map<string, PdfiumFont> = new Map();

  private constructor(m: WrappedPdfiumModule, docPtr: number) {
    this._m = m;
    this._docPtr = docPtr;
  }

  /** Create a new empty PDF document. Drop-in replacement for `PDFDocument.create()`. */
  static async create(): Promise<PdfiumDocument> {
    const m = await getPdfiumModule();
    const docPtr = m.FPDF_CreateNewDocument();
    if (!docPtr) throw new Error("PDFium: failed to create document");
    return new PdfiumDocument(m, docPtr);
  }

  /** Add a new page to the document. */
  addPage(dimensions: [number, number]): PdfiumPage {
    const [width, height] = dimensions;
    const insertIdx = this._pages.length;
    const pagePtr = this._m.FPDFPage_New(
      this._docPtr,
      insertIdx,
      width,
      height,
    );
    if (!pagePtr) throw new Error("PDFium: failed to create page");
    const page = new PdfiumPage(this._m, this._docPtr, pagePtr, width, height);
    this._pages.push(page);
    return page;
  }

  /** Embed a standard PDF font. Returns a PdfiumFont for text measurement and drawing. */
  async embedFont(fontName: string): Promise<PdfiumFont> {
    if (this._fonts.has(fontName)) return this._fonts.get(fontName)!;
    const font = new PdfiumFont(fontName);
    this._fonts.set(fontName, font);
    return font;
  }

  /** Embed a PNG image from raw bytes. */
  async embedPng(bytes: Uint8Array | ArrayBuffer): Promise<PdfiumImage> {
    return this._decodeImage(
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      "image/png",
    );
  }

  /** Embed a JPEG image from raw bytes. */
  async embedJpg(bytes: Uint8Array | ArrayBuffer): Promise<PdfiumImage> {
    return this._decodeImage(
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      "image/jpeg",
    );
  }

  /** Get the number of pages. */
  getPageCount(): number {
    return this._pages.length;
  }

  /** Save the document and return the PDF bytes. */
  async save(): Promise<Uint8Array> {
    // Generate content for all pages before saving
    for (const page of this._pages) {
      page._generateContent();
    }

    const buf = await saveRawDocument(this._docPtr);

    // Close all pages and the document
    for (const page of this._pages) {
      page._close();
    }
    this._m.FPDF_CloseDocument(this._docPtr);

    return new Uint8Array(buf);
  }

  /**
   * Decode image bytes to RGBA pixel data via canvas.
   * PDFium's image object APIs require bitmap data.
   */
  private _decodeImage(
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<PdfiumImage> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([bytes as BlobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error("Canvas 2D context unavailable"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(
            new PdfiumImage(
              new Uint8Array(imageData.data.buffer),
              canvas.width,
              canvas.height,
            ),
          );
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to decode image"));
      };
      img.src = url;
    });
  }
}
