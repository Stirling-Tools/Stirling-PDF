interface ReadAloudHighlightParams {
  viewportTransform: number[];
  textTransform: number[];
  itemWidth: number;
  itemHeight: number;
}

export interface ReadAloudHighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function multiplyTransforms(left: number[], right: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function computeReadAloudHighlightRect({
  viewportTransform,
  textTransform,
  itemWidth,
  itemHeight,
}: ReadAloudHighlightParams): ReadAloudHighlightRect | null {
  if (
    viewportTransform.length < 6 ||
    textTransform.length < 6 ||
    itemWidth <= 0 ||
    itemHeight <= 0
  ) {
    return null;
  }

  const [, , , , e, f] = multiplyTransforms(viewportTransform, textTransform);
  const [va, vb, vc, vd] = viewportTransform;
  const viewportScaleX = Math.hypot(va, vb);
  const viewportScaleY = Math.hypot(vc, vd);
  const width = Math.max(itemWidth * viewportScaleX, 8);
  const height = Math.max(itemHeight * viewportScaleY, 12);

  return {
    left: e,
    top: f - height,
    width,
    height,
  };
}
