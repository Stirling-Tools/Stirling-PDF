import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  measureScanInk,
  type ScanRegion,
} from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";

export interface PlacedWord {
  x: number;
  right: number;
  baseline: number;
}

export interface OcrLine {
  baseline: number;
  /** OCR's glyph box height above the baseline. */
  height: number;
  words: PlacedWord[];
}

const OFF_INK_SHIFTS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].flatMap((k) => [
  k,
  -k,
]);

export function lineExtent(line: OcrLine): { x0: number; x1: number } {
  return { x0: line.words[0].x, x1: line.words[line.words.length - 1].right };
}

/** The rows that hold glyphs sitting on baselines between `low` and `high`, descenders included. */
export function lineRegion(
  x0: number,
  x1: number,
  low: number,
  high: number,
  height: number,
): ScanRegion {
  return { x0, x1, bottom: low - height * 0.1, top: high + height * 0.9 };
}

function lineInkAt(
  doc: EditorDocument,
  page: Page,
  line: OcrLine,
  dy: number,
): boolean {
  const { x0, x1 } = lineExtent(line);
  const baseline = line.baseline + dy;
  const ink = measureScanInk(
    doc.module,
    page,
    lineRegion(x0, x1, baseline, baseline, line.height),
  );
  return !!ink && ink.rect.width >= (x1 - x0) * 0.5;
}

function claimedByOtherLine(
  lines: OcrLine[],
  others: PlacedWord[],
  line: OcrLine,
  dy: number,
): boolean {
  const { x0, x1 } = lineExtent(line);
  const baseline = line.baseline + dy;
  const placed = [
    ...lines.filter((l) => l !== line).flatMap((l) => l.words),
    ...others,
  ];
  return placed.some(
    (w) =>
      w.right > x0 && w.x < x1 && Math.abs(w.baseline - baseline) < line.height,
  );
}

/** Whether every OCR line has the scan's ink at one shared offset nothing else claims: the OCR layer sits beside the text it read. `lines` must all hold words. */
export function inkBesideOcr(
  doc: EditorDocument,
  page: Page,
  lines: OcrLine[],
  others: PlacedWord[],
): boolean {
  return OFF_INK_SHIFTS.some((k) =>
    lines.every(
      (l) =>
        !claimedByOtherLine(lines, others, l, k * l.height) &&
        lineInkAt(doc, page, l, k * l.height),
    ),
  );
}
