import type { RGBA } from "@editor/tools/pdfTextEditor/types";

export const FAUX_BOLD_EM = 0.03;

const FILL_AND_STROKE = 2;

interface InkedRun {
  fontSize: number;
  fill: RGBA;
  renderMode?: number;
  stroke?: RGBA | null;
  strokeWidth?: number | null;
}

export function fauxBoldWidth(fontSize: number): number {
  return fontSize * FAUX_BOLD_EM;
}

export function isFauxBold(run: InkedRun): boolean {
  const stroke = run.stroke;
  if (run.renderMode !== FILL_AND_STROKE || !stroke) return false;
  const sameInk =
    stroke.r === run.fill.r &&
    stroke.g === run.fill.g &&
    stroke.b === run.fill.b;
  const width = run.strokeWidth ?? 0;
  return (
    sameInk &&
    Math.abs(width - fauxBoldWidth(run.fontSize)) <= run.fontSize * 0.005
  );
}
