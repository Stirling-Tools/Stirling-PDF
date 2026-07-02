import type { Affine, PageRect } from "@app/tools/pdfTextEditor/v2/types";

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Map a point through an affine: (x,y) -> (a·x + c·y + e, b·x + d·y + f). */
export function applyAffine(
  t: Affine,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f };
}

/** Compose two affines: `parent ∘ child` (child applied first, then parent). */
export function composeAffine(parent: Affine, child: Affine): Affine {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f,
  };
}

/** Transform a rect by an affine and return the new AABB (4 corners, min/max). */
export function transformRectAABB(t: Affine, r: PageRect): PageRect {
  const cs = [
    applyAffine(t, r.x, r.y),
    applyAffine(t, r.x + r.width, r.y),
    applyAffine(t, r.x, r.y + r.height),
    applyAffine(t, r.x + r.width, r.y + r.height),
  ];
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** Inverse of an affine, or identity when singular (degenerate linear part). */
export function invertAffine(t: Affine): Affine {
  const det = t.a * t.d - t.b * t.c;
  if (!det || !Number.isFinite(det)) return { ...IDENTITY };
  const a = t.d / det;
  const b = -t.b / det;
  const c = -t.c / det;
  const d = t.a / det;
  return { a, b, c, d, e: -(a * t.e + c * t.f), f: -(b * t.e + d * t.f) };
}

/** Axis-aligned bounds of an image's projected 1x1 unit square under `m`. */
export function imageMatrixBounds(m: Affine): PageRect {
  const xs = [m.e, m.e + m.a, m.e + m.c, m.e + m.a + m.c];
  const ys = [m.f, m.f + m.b, m.f + m.d, m.f + m.b + m.d];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/**
 * New RAW image matrix when the user moves/resizes the image's display-space
 * AABB from `prevBounds` to `nextBounds`. The image's *displayed* footprint is
 * scaled+translated from one AABB to the other while its internal orientation
 * (any rotation/flip baked into `prev`) is PRESERVED - so a move never
 * re-orients the image and a resize never swaps its width/height.
 *
 * It works in display space (where the editor's drag UI operates) then maps
 * back to raw via the page's display transform `A`, so /Rotate + CropBox pages
 * are handled intrinsically rather than with a separate counter-rotation that
 * mishandled the raw-vs-display dimension swap.
 *
 * When `A` is identity and `prev` is an axis-aligned `(w,0,0,h,x,y)` matrix the
 * result is exactly `(nextW,0,0,nextH,nextX,nextY)` - byte-identical to the
 * pre-fix axis-aligned placement, so the common (unrotated) case is unchanged.
 */
export function remapImageMatrix(
  prev: Affine,
  prevBounds: PageRect,
  nextBounds: PageRect,
  display: Affine,
): Affine {
  const A = display;
  const Ainv = invertAffine(A);
  const origDisp = transformRectAABB(A, prevBounds);
  const targetDisp = transformRectAABB(A, nextBounds);
  const sx = origDisp.width > 1e-6 ? targetDisp.width / origDisp.width : 1;
  const sy = origDisp.height > 1e-6 ? targetDisp.height / origDisp.height : 1;
  // Display-space scale+translate mapping origDisp -> targetDisp (axis-aligned).
  const S: Affine = {
    a: sx,
    b: 0,
    c: 0,
    d: sy,
    e: targetDisp.x - sx * origDisp.x,
    f: targetDisp.y - sy * origDisp.y,
  };
  // raw' = A⁻¹ ∘ S ∘ A ∘ prev
  return composeAffine(Ainv, composeAffine(S, composeAffine(A, prev)));
}
