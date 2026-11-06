import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { Affine, PageRect } from "@editor/tools/pdfTextEditor/types";
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

export function invert(t: Affine): Affine {
  const det = t.a * t.d - t.b * t.c;
  return {
    a: t.d / det,
    b: -t.b / det,
    c: -t.c / det,
    d: t.a / det,
    e: (t.c * t.f - t.d * t.e) / det,
    f: (t.b * t.e - t.a * t.f) / det,
  };
}

export function compose(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export function applyPoint(
  t: Affine,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
}

export function applyRect(t: Affine, r: PageRect): PageRect {
  const corners = [
    applyPoint(t, r.x, r.y),
    applyPoint(t, r.x + r.width, r.y),
    applyPoint(t, r.x, r.y + r.height),
    applyPoint(t, r.x + r.width, r.y + r.height),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
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
    e: page.width / 2 - (turn.a * cx + turn.c * cy),
    f: page.height / 2 - (turn.b * cx + turn.d * cy),
  };
  return { toUpright, fromUpright: invert(toUpright) };
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
