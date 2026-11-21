import type {
  DocumentCorners,
  RgbaImage,
} from "@editor/utils/documentDetection";

/** Owns a fresh buffer, so it can back an `ImageData` without copying. */
export interface WarpedImage extends RgbaImage {
  data: Uint8ClampedArray<ArrayBuffer>;
}

type Homography = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** Maps output pixel coordinates to source coordinates for the given page corners. */
function outputToSource(
  corners: DocumentCorners,
  width: number,
  height: number,
): Homography | null {
  const pairs = [
    [0, 0, corners.topLeft],
    [width, 0, corners.topRight],
    [width, height, corners.bottomRight],
    [0, height, corners.bottomLeft],
  ] as const;
  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (const [u, v, { x, y }] of pairs) {
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }
  const h = solve(matrix, rhs);
  return h ? ([...h, 1] as Homography) : null;
}

/**
 * Straightens the page inside `corners` into a `width` × `height` image,
 * sampling `source` bilinearly. Corners are in `source` pixels; points that
 * fall outside the source come out black. Returns `null` when the corners
 * are degenerate (collinear), so callers can keep the unwarped frame.
 */
export function warpPerspective(
  source: RgbaImage,
  corners: DocumentCorners,
  width: number,
  height: number,
): WarpedImage | null {
  const h = outputToSource(corners, width, height);
  if (!h) return null;
  const { data: src, width: sw, height: sh } = source;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let v = 0; v < height; v++) {
    const cy = v + 0.5;
    for (let u = 0; u < width; u++) {
      const cx = u + 0.5;
      const w = h[6] * cx + h[7] * cy + h[8];
      const x = (h[0] * cx + h[1] * cy + h[2]) / w - 0.5;
      const y = (h[3] * cx + h[4] * cy + h[5]) / w - 0.5;
      const o = (v * width + u) * 4;
      out[o + 3] = 255;
      if (x < -0.5 || y < -0.5 || x > sw - 0.5 || y > sh - 0.5) continue;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(x)));
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(y)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, x - x0));
      const fy = Math.max(0, Math.min(1, y - y0));
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
    }
  }
  return { data: out, width, height };
}
