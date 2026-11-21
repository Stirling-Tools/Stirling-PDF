import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { Affine, PageRect } from "@editor/tools/pdfTextEditor/types";
import { invertAffine } from "@editor/tools/pdfTextEditor/model/affine";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";

export interface ScanFrame {
  toUpright: Affine;
  fromUpright: Affine;
}

const SKEW_TOLERANCE = (2 * Math.PI) / 180;

const UPRIGHT_TURNS: Array<Pick<Affine, "a" | "b" | "c" | "d">> = [
  { a: 1, b: 0, c: 0, d: 1 },
  { a: 0, b: -1, c: 1, d: 0 },
  { a: -1, b: 0, c: 0, d: -1 },
  { a: 0, b: 1, c: -1, d: 0 },
];

export function quarterTurns(matrix: Affine): number | null {
  const { a, b, c, d } = matrix;
  if (a * d - b * c <= 0) return null;
  const angle = Math.atan2(b, a);
  const turns = Math.round(angle / (Math.PI / 2));
  if (Math.abs(angle - turns * (Math.PI / 2)) > SKEW_TOLERANCE) return null;
  return ((turns % 4) + 4) % 4;
}

export function applyVector(
  t: Affine,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  return { dx: t.a * dx + t.c * dy, dy: t.b * dx + t.d * dy };
}

export function scanFrameFor(
  page: Page,
  matrix: Affine,
  bounds: PageRect,
): ScanFrame | null {
  const turns = quarterTurns(matrix);
  if (turns === null || turns === 0) return null;
  const turn = UPRIGHT_TURNS[turns];
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const toUpright: Affine = {
    ...turn,
    e:
      page.display.cropLeft +
      page.display.cropWidth / 2 -
      (turn.a * cx + turn.c * cy),
    f:
      page.display.cropBottom +
      page.display.cropHeight / 2 -
      (turn.b * cx + turn.d * cy),
  };
  return { toUpright, fromUpright: invertAffine(toUpright) };
}

export function moveAllObjects(
  m: WrappedPdfiumModule,
  page: Page,
  t: Affine,
): void {
  const count = m.FPDFPage_CountObjects(page.pagePtr);
  for (let i = 0; i < count; i++)
    transformObject(
      m,
      m.FPDFPage_GetObject(page.pagePtr, i),
      t.a,
      t.b,
      t.c,
      t.d,
      t.e,
      t.f,
    );
}
