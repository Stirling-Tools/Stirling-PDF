import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Affine, PageRect } from "@editor/tools/pdfTextEditor/types";
import {
  applyAffine,
  composeAffine,
} from "@editor/tools/pdfTextEditor/model/affine";
import { chainTo } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { readMatrix } from "@editor/tools/pdfTextEditor/commands/textPieces";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
// Points of slack before a clip counts as hiding part of an image.
const HIDES_SLACK_PT = 0.5;

/** An image's bounds and the page-space box of the clips it is drawn through. */
interface ClippedImage {
  bounds: PageRect;
  clip?: PageRect | null;
}

function intersectRect(a: PageRect, b: PageRect): PageRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

// The box around one object's clip in page space, or null when it has none.
// A curve's control points bound the curve, so the box never cuts it.
function clipBox(
  m: WrappedPdfiumModule,
  obj: number,
  toPage: Affine,
): PageRect | null {
  const clip = m.FPDFPageObj_GetClipPath(obj);
  if (!clip) return null;
  const paths = m.FPDFClipPath_CountPaths(clip);
  if (paths <= 0) return null;
  const buf = scratchPtr(m, SCRATCH.liftClipPoint, 8);
  let box: PageRect | null = null;
  for (let path = 0; path < paths; path++) {
    const xs: number[] = [];
    const ys: number[] = [];
    const count = m.FPDFClipPath_CountPathSegments(clip, path);
    for (let i = 0; i < count; i++) {
      const segment = m.FPDFClipPath_GetPathSegment(clip, path, i);
      if (!segment || !m.FPDFPathSegment_GetPoint(segment, buf, buf + 4))
        continue;
      const p = applyAffine(
        toPage,
        m.pdfium.getValue(buf, "float"),
        m.pdfium.getValue(buf + 4, "float"),
      );
      xs.push(p.x);
      ys.push(p.y);
    }
    if (xs.length === 0) continue;
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const pathBox = {
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    };
    box = narrowTo(box, pathBox);
  }
  return box;
}

function narrowTo(box: PageRect | null, next: PageRect): PageRect {
  return box ? intersectRect(box, next) : next;
}

function toAffine(matrix: Float32Array): Affine {
  const [a, b, c, d, e, f] = matrix;
  return { a, b, c, d, e, f };
}

/**
 * The page-space box of the clips an image is drawn through: its own and
 * those of every form that draws it. Null when nothing clips it.
 */
export function readImageClip(
  m: WrappedPdfiumModule,
  pagePtr: number,
  objPtr: number,
  containerPtr: number,
): PageRect | null {
  if (!objPtr) return null;
  const chain = containerPtr ? (chainTo(m, pagePtr, containerPtr) ?? []) : [];
  let toPage = IDENTITY;
  let box: PageRect | null = null;
  for (const form of chain) {
    const formBox = clipBox(m, form, toPage);
    if (formBox) box = narrowTo(box, formBox);
    const matrix = readMatrix(m, form);
    if (matrix) toPage = composeAffine(toPage, toAffine(matrix));
  }
  const own = clipBox(m, objPtr, toPage);
  if (own) box = narrowTo(box, own);
  return box;
}

/** What of an image shows on the page: its bounds cut to its clip. */
export function visibleImageBounds(image: ClippedImage): PageRect {
  return image.clip ? intersectRect(image.bounds, image.clip) : image.bounds;
}

/** True when the image's clip hides part of what it draws. */
export function clipHidesImage(image: ClippedImage): boolean {
  if (!image.clip) return false;
  const shown = visibleImageBounds(image);
  return (
    shown.width < image.bounds.width - HIDES_SLACK_PT ||
    shown.height < image.bounds.height - HIDES_SLACK_PT
  );
}

/**
 * The image bounds that put its visible part at `nextVisible`: the move or
 * scale that takes the visible box from where it is to `nextVisible`, applied
 * to the whole image, which carries its clip with it.
 */
export function imageBoundsForVisible(
  image: ClippedImage,
  nextVisible: PageRect,
): PageRect {
  const shown = visibleImageBounds(image);
  const sx = shown.width > 1e-6 ? nextVisible.width / shown.width : 1;
  const sy = shown.height > 1e-6 ? nextVisible.height / shown.height : 1;
  const b = image.bounds;
  return {
    x: nextVisible.x + (b.x - shown.x) * sx,
    y: nextVisible.y + (b.y - shown.y) * sy,
    width: b.width * sx,
    height: b.height * sy,
  };
}
