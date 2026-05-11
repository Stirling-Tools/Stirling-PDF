import type {
  MeasureScale,
  PageMeasureScales,
  PageScaleInfo,
  ViewportScale,
} from "@app/components/viewer/RulerOverlay";
import { getUnitFactor } from "@app/utils/measurementUtils";

type PdfLookupable = {
  lookup: (key: unknown) => unknown;
};

type PdfArrayLike = {
  size: () => number;
  lookup: (index: number) => unknown;
};

type PdfNumberLike = {
  asNumber: () => number;
};

type PdfTextLike = {
  decodeText: () => string;
};

function isLookupable(value: unknown): value is PdfLookupable {
  return (
    typeof value === "object" &&
    value !== null &&
    "lookup" in value &&
    typeof (value as PdfLookupable).lookup === "function"
  );
}

function isArrayLike(value: unknown): value is PdfArrayLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "lookup" in value &&
    typeof (value as PdfArrayLike).size === "function" &&
    typeof (value as PdfArrayLike).lookup === "function"
  );
}

function isNumberLike(value: unknown): value is PdfNumberLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "asNumber" in value &&
    typeof (value as PdfNumberLike).asNumber === "function"
  );
}

function isTextLike(value: unknown): value is PdfTextLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "decodeText" in value &&
    typeof (value as PdfTextLike).decodeText === "function"
  );
}

function readNumber(value: unknown): number | null {
  return isNumberLike(value) ? value.asNumber() : null;
}

function readBBox(value: unknown): ViewportScale["bbox"] {
  if (!isArrayLike(value) || value.size() < 4) {
    return null;
  }

  const points = [0, 1, 2, 3].map((index) => readNumber(value.lookup(index)));
  if (points.some((point) => point === null)) {
    return null;
  }

  return points as [number, number, number, number];
}

function parseScale(measureObj: unknown): MeasureScale | null {
  if (!isLookupable(measureObj)) return null;

  let fmtArray = measureObj.lookup("D");
  if (!isArrayLike(fmtArray)) {
    fmtArray = measureObj.lookup("X");
  }
  if (!isArrayLike(fmtArray) || fmtArray.size() === 0) return null;

  const firstFmt = fmtArray.lookup(0);
  if (!isLookupable(firstFmt)) return null;

  const cObj = firstFmt.lookup("C");
  const uObj = firstFmt.lookup("U");
  const factor = readNumber(cObj);
  if (factor === null || factor <= 0) return null;

  const unit = isTextLike(uObj) ? uObj.decodeText() : "units";
  const baseFactor = getUnitFactor(unit);
  const ratio =
    typeof baseFactor === "number" && baseFactor > 0
      ? factor / baseFactor
      : null;

  return { factor, ratio, unit };
}

export async function extractPageMeasureScales(
  file: Blob,
): Promise<PageMeasureScales | null> {
  try {
    const { PDFDocument, PDFArray, PDFDict, PDFName } =
      await import("@cantoo/pdf-lib");
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: true,
    });

    const result: PageMeasureScales = new Map();

    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const pageHeight = page.getHeight();
      const pageNode = page.node as unknown as PdfLookupable;
      const viewports: ViewportScale[] = [];

      const vpObj = pageNode.lookup(PDFName.of("VP"));
      if (vpObj instanceof PDFArray) {
        for (let j = 0; j < vpObj.size(); j++) {
          const vpEntry = vpObj.lookup(j);
          if (!(vpEntry instanceof PDFDict)) continue;

          const scale = parseScale(vpEntry.lookup(PDFName.of("Measure")));
          if (!scale) continue;

          viewports.push({
            bbox: readBBox(vpEntry.lookup(PDFName.of("BBox"))),
            scale,
          });
        }
      }

      if (viewports.length === 0) {
        const scale = parseScale(pageNode.lookup(PDFName.of("Measure")));
        if (scale) {
          viewports.push({ bbox: null, scale });
        }
      }

      if (viewports.length > 0) {
        result.set(i, { viewports, pageHeight } satisfies PageScaleInfo);
      }
    }

    return result.size > 0 ? result : null;
  } catch (error) {
    console.warn("[Measurement] Failed to extract PDF scales", error);
    return null;
  }
}
