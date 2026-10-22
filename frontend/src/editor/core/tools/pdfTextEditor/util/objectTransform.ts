import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Affine } from "@app/tools/pdfTextEditor/types";
import {
  composeAffine,
  invertAffine,
} from "@app/tools/pdfTextEditor/model/affine";

interface ClipPathModule {
  FPDFPageObj_TransformClipPath?: (
    obj: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
}

/** Transform an object's clip path by the same matrix. No-op when unclipped. */
function transformClip(m: WrappedPdfiumModule, ptr: number, t: Affine): void {
  try {
    (m as unknown as ClipPathModule).FPDFPageObj_TransformClipPath?.(
      ptr,
      t.a,
      t.b,
      t.c,
      t.d,
      t.e,
      t.f,
    );
  } catch {
    /* best-effort */
  }
}

// Move an object AND its clip path. Transforming the object alone leaves the
// clip behind, so moved clipped content gets sliced by a stale rectangle.
export function transformObject(
  m: WrappedPdfiumModule,
  ptr: number,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): void {
  if (!ptr) return;
  m.FPDFPageObj_Transform(ptr, a, b, c, d, e, f);
  transformClip(m, ptr, { a, b, c, d, e, f });
}

// Follow an ABSOLUTE matrix change with the clip. The page-space delta between
// two object matrices is `next · prev⁻¹`.
export function retargetClipPath(
  m: WrappedPdfiumModule,
  ptr: number,
  prev: Affine,
  next: Affine,
): void {
  if (!ptr) return;
  transformClip(m, ptr, composeAffine(next, invertAffine(prev)));
}
