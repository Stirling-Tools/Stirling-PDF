import type {
  PDFFont,
  PDFHexString,
  PDFOperator,
  PDFPage,
} from "@cantoo/pdf-lib";
import type { Measurement, PagePoint } from "@app/utils/measurementTypes";
import { polygonCentroid } from "@app/utils/measurementUtils";

export interface MeasurementToSave {
  measurement: Measurement;
  /** The label as shown in the viewer, e.g. "Kitchen: 12.40 m²". */
  text: string;
  color: string;
  strokeWidth: number;
}

type PdfLib = typeof import("@cantoo/pdf-lib");

/**
 * The PDF is encrypted. Objects added here would be written unencrypted into
 * a file that declares encryption, so readers would decrypt them to garbage.
 */
export class EncryptedPdfError extends Error {
  constructor() {
    super("Cannot add measurements to an encrypted PDF");
    this.name = "EncryptedPdfError";
  }
}

const LABEL_FONT_SIZE = 9;
const LABEL_PADDING = 2.5;
const AREA_FILL_OPACITY = 0.14;
interface PdfPoint {
  x: number;
  y: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

/**
 * Page space (y down from the top of the crop box, as pdfium reports pages)
 * to PDF user space (y up from the origin).
 */
function toUserSpace(page: PDFPage, point: PagePoint): PdfPoint {
  const crop = page.getCropBox();
  return { x: crop.x + point.x, y: crop.y + crop.height - point.y };
}

/** Drop characters the standard font cannot encode rather than failing the save. */
function encodable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text)
    .filter((char) => supported.has(char.codePointAt(0) ?? -1))
    .join("");
}

function labelAnchor(kind: Measurement["kind"], points: PdfPoint[]): PdfPoint {
  if (kind === "area") return polygonCentroid(points);
  let best = { a: points[0], b: points[1], length: -1 };
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    if (length > best.length) best = { a: points[i - 1], b: points[i], length };
  }
  const dx = best.b.x - best.a.x;
  const dy = best.b.y - best.a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Normal pointing up the page, so the label sits above the line.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const offset = LABEL_FONT_SIZE;
  return {
    x: (best.a.x + best.b.x) / 2 + nx * offset,
    y: (best.a.y + best.b.y) / 2 + ny * offset,
  };
}

function appearanceOperators(
  lib: PdfLib,
  item: MeasurementToSave,
  points: PdfPoint[],
  label: { encoded: PDFHexString; x: number; y: number; width: number },
): PDFOperator[] {
  const {
    pushGraphicsState,
    popGraphicsState,
    setStrokingRgbColor,
    setFillingRgbColor,
    setLineWidth,
    setLineCap,
    setLineJoin,
    LineCapStyle,
    LineJoinStyle,
    moveTo,
    lineTo,
    closePath,
    stroke,
    fill,
    rectangle,
    fillAndStroke,
    setGraphicsState,
    beginText,
    endText,
    setFontAndSize,
    moveText,
    showText,
    PDFName,
  } = lib;
  const [r, g, b] = hexToRgb(item.color);
  const kind = item.measurement.kind;
  const path: PDFOperator[] = [
    moveTo(points[0].x, points[0].y),
    ...points.slice(1).map((p) => lineTo(p.x, p.y)),
  ];
  if (kind === "area") path.push(closePath());

  const ops: PDFOperator[] = [pushGraphicsState()];
  if (kind === "area") {
    ops.push(
      pushGraphicsState(),
      setGraphicsState(PDFName.of("GSFill")),
      setFillingRgbColor(r, g, b),
      ...path,
      fill(),
      popGraphicsState(),
    );
  }
  ops.push(
    setStrokingRgbColor(r, g, b),
    setLineWidth(item.strokeWidth),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Round),
    ...path,
    stroke(),
  );

  if (label.width > 0) {
    const boxHeight = LABEL_FONT_SIZE + LABEL_PADDING * 2;
    ops.push(
      setLineWidth(0.75),
      setFillingRgbColor(1, 1, 1),
      rectangle(
        label.x - label.width / 2 - LABEL_PADDING,
        label.y - boxHeight / 2,
        label.width + LABEL_PADDING * 2,
        boxHeight,
      ),
      fillAndStroke(),
      beginText(),
      setFillingRgbColor(r, g, b),
      setFontAndSize("Helv", LABEL_FONT_SIZE),
      moveText(label.x - label.width / 2, label.y - LABEL_FONT_SIZE * 0.35),
      showText(label.encoded),
      endText(),
    );
  }
  ops.push(popGraphicsState());
  return ops;
}

/**
 * Draw each measurement into its page's content as vector lines and text, the
 * same as the rest of the drawing. Deliberately not annotations: viewers list
 * annotations as comments, credited to whoever is signed in. Returns the new
 * bytes; throws EncryptedPdfError for an encrypted PDF.
 */
export async function drawMeasurementsIntoPdf(
  pdfBytes: ArrayBuffer,
  items: MeasurementToSave[],
): Promise<Uint8Array> {
  const lib = await import("@cantoo/pdf-lib");
  const {
    PDFDocument,
    PDFName,
    StandardFonts,
    drawObject,
    popGraphicsState,
    pushGraphicsState,
  } = lib;
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  if (doc.isEncrypted) throw new EncryptedPdfError();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const fillState = doc.context.obj({
    Type: PDFName.of("ExtGState"),
    ca: AREA_FILL_OPACITY,
  });
  const isolatedPages = new Set<number>();

  for (const item of items) {
    const { measurement } = item;
    const pageIndex = measurement.points[0]?.pageIndex ?? -1;
    const page = pages[pageIndex];
    if (!page) continue;

    if (!isolatedPages.has(pageIndex)) {
      isolateExistingContent(lib, page);
      isolatedPages.add(pageIndex);
    }

    const points = measurement.points.map((p) => toUserSpace(page, p));
    const text = encodable(font, item.text);
    const width = font.widthOfTextAtSize(text, LABEL_FONT_SIZE);
    const anchor = labelAnchor(measurement.kind, points);
    // Encoded through the font so WinAnsi glyphs such as "²" survive.
    const label = {
      encoded: font.encodeText(text),
      x: anchor.x,
      y: anchor.y,
      width,
    };

    const halfBox = width / 2 + LABEL_PADDING + 1;
    const halfHeight = LABEL_FONT_SIZE / 2 + LABEL_PADDING + 1;
    const pad = item.strokeWidth + 2;
    const xs = [
      ...points.map((p) => p.x),
      anchor.x - halfBox,
      anchor.x + halfBox,
    ];
    const ys = [
      ...points.map((p) => p.y),
      anchor.y - halfHeight,
      anchor.y + halfHeight,
    ];

    const drawing = doc.context.formXObject(
      appearanceOperators(lib, item, points, label),
      {
        BBox: [
          Math.min(...xs) - pad,
          Math.min(...ys) - pad,
          Math.max(...xs) + pad,
          Math.max(...ys) + pad,
        ],
        Resources: {
          Font: { Helv: font.ref },
          ExtGState: { GSFill: fillState },
        },
      },
    );
    const name = page.node.newXObject(
      "Measurement",
      doc.context.register(drawing),
    );
    page.pushOperators(
      pushGraphicsState(),
      drawObject(name),
      popGraphicsState(),
    );
  }

  return doc.save();
}

/**
 * Wrap the page's existing content in q/Q so a transform it leaves applied
 * cannot shift what is drawn after it. Must run before the first draw, or the
 * new content would be wrapped with it.
 */
function isolateExistingContent(lib: PdfLib, page: PDFPage) {
  const { PDFContentStream, popGraphicsState, pushGraphicsState } = lib;
  const { context } = page.doc;
  page.node.normalize();
  const start = PDFContentStream.of(context.obj({}), [pushGraphicsState()]);
  const end = PDFContentStream.of(context.obj({}), [popGraphicsState()]);
  page.node.wrapContentStreams(context.register(start), context.register(end));
}
