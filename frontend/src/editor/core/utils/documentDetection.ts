/**
 * Finds a sheet of paper in a camera frame and returns its four corners. Pure
 * TypeScript over RGBA pixels: no OpenCV, no DOM, so it runs in a worker or a
 * test as readily as on the page.
 *
 * Candidate quadrilaterals come from several sources because each fails where
 * another holds: regions enclosed by edges survive text on the page, hulls of
 * edge chains survive a region leaking through a gap in the outline, regions
 * thresholded on brightness or colourfulness survive a page with no crisp
 * edge at all, and pairs of straight lines survive a pen or cable cutting the
 * outline into pieces. Every candidate is scored by how much of its perimeter
 * lies on a real, isolated edge, which rejects tables, shadows and the frame.
 */

export interface Point {
  x: number;
  y: number;
}

export interface DocumentCorners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/** RGBA pixels, row-major; `ImageData` satisfies it. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface GrayImage {
  data: Float32Array;
  width: number;
  height: number;
}

type Quad = [Point, Point, Point, Point];

const MIN_AREA_FRACTION = 0.04;
const MIN_EDGE_SUPPORT = 0.5;
const SUPPORT_MIN_STEP = 8;
const POLARITY_WEIGHT = 0.1;
const SUPPORT_TEXTURE_RATIO = 1.5;
const SUPPORT_BAND_DISTANCES = [3, 4];
const CANNY_HIGH_THRESHOLDS = [30, 60, 120];
const CHROMA_GAIN = 2;
const MIN_CORNER_ANGLE = (40 * Math.PI) / 180;
const TAN_22_5 = Math.tan(Math.PI / 8);
const TAN_67_5 = Math.tan((3 * Math.PI) / 8);

function toGray(image: RgbaImage): GrayImage {
  const { data, width, height } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return { data: gray, width, height };
}

function blur(image: GrayImage): GrayImage {
  const { data, width, height } = image;
  const horizontal = new Float32Array(data.length);
  const out = new Float32Array(data.length);
  const lastX = width - 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const l2 = data[row + (x < 2 ? 0 : x - 2)];
      const l1 = data[row + (x < 1 ? 0 : x - 1)];
      const r1 = data[row + (x + 1 > lastX ? lastX : x + 1)];
      const r2 = data[row + (x + 2 > lastX ? lastX : x + 2)];
      horizontal[row + x] =
        (l2 + r2) * (1 / 16) + (l1 + r1) * (4 / 16) + data[row + x] * (6 / 16);
    }
  }
  const lastRow = (height - 1) * width;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const up2 = y < 2 ? 0 : row - 2 * width;
    const up1 = y < 1 ? 0 : row - width;
    const down1 = row + width > lastRow ? lastRow : row + width;
    const down2 = row + 2 * width > lastRow ? lastRow : row + 2 * width;
    for (let x = 0; x < width; x++) {
      out[row + x] =
        (horizontal[up2 + x] + horizontal[down2 + x]) * (1 / 16) +
        (horizontal[up1 + x] + horizontal[down1 + x]) * (4 / 16) +
        horizontal[row + x] * (6 / 16);
    }
  }
  return { data: out, width, height };
}

interface Gradients {
  gx: Float32Array;
  gy: Float32Array;
  magnitude: Float32Array;
}

function sobel(image: GrayImage): Gradients {
  const { data, width, height } = image;
  const gx = new Float32Array(data.length);
  const gy = new Float32Array(data.length);
  const magnitude = new Float32Array(data.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = data[i - width - 1];
      const t = data[i - width];
      const tr = data[i - width + 1];
      const l = data[i - 1];
      const r = data[i + 1];
      const bl = data[i + width - 1];
      const b = data[i + width];
      const br = data[i + width + 1];
      const dx = tr + 2 * r + br - tl - 2 * l - bl;
      const dy = bl + 2 * b + br - tl - 2 * t - tr;
      gx[i] = dx;
      gy[i] = dy;
      magnitude[i] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  return { gx, gy, magnitude };
}

/**
 * Per pixel, the strongest of three gradients. Luminance finds most pages.
 * The smallest RGB channel finds white paper on a warm table (wood, beige,
 * pink), which barely differs in brightness but sharply in blue. Neutrality
 * finds paper on a near-white desk, where only a faint colour cast separates
 * them. All three are higher on white paper, so a side's polarity stays the
 * same whichever channel wins at each pixel.
 */
function paperGradients(
  image: RgbaImage,
  luminance: GrayImage,
  neutrality: GrayImage,
): Gradients {
  const { data, width, height } = image;
  const whiteness = new Float32Array(width * height);
  for (let i = 0, p = 0; i < whiteness.length; i++, p += 4) {
    whiteness[i] = Math.min(data[p], data[p + 1], data[p + 2]);
  }
  const combined = sobel(luminance);
  for (const other of [
    sobel(blur({ data: whiteness, width, height })),
    sobel(neutrality),
  ]) {
    for (let i = 0; i < whiteness.length; i++) {
      if (other.magnitude[i] > combined.magnitude[i]) {
        combined.gx[i] = other.gx[i];
        combined.gy[i] = other.gy[i];
        combined.magnitude[i] = other.magnitude[i];
      }
    }
  }
  return combined;
}

/**
 * Lack of colour (255 minus amplified max − min of RGB), blurred. The gain lets
 * a faint colour cast compete with brightness steps.
 */
function neutralityChannel(image: RgbaImage): GrayImage {
  const { data, width, height } = image;
  const neutrality = new Float32Array(width * height);
  for (let i = 0, p = 0; i < neutrality.length; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    neutrality[i] = Math.max(
      0,
      255 - CHROMA_GAIN * (Math.max(r, g, b) - Math.min(r, g, b)),
    );
  }
  return blur({ data: neutrality, width, height });
}

function otsuThreshold(gray: Float32Array): number {
  const histogram = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) {
    const bin = Math.round(gray[i]);
    histogram[bin < 0 ? 0 : bin > 255 ? 255 : bin]++;
  }
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const between =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function nonMaximumSuppression(
  gradients: Gradients,
  width: number,
  height: number,
): Float32Array {
  const { gx, gy, magnitude } = gradients;
  const thin = new Float32Array(magnitude.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = magnitude[i];
      if (m === 0) continue;
      const ax = Math.abs(gx[i]);
      const ay = Math.abs(gy[i]);
      let a: number;
      let b: number;
      if (ay < ax * TAN_22_5) {
        a = magnitude[i - 1];
        b = magnitude[i + 1];
      } else if (ay <= ax * TAN_67_5 && gx[i] * gy[i] > 0) {
        a = magnitude[i - width - 1];
        b = magnitude[i + width + 1];
      } else if (ay > ax * TAN_67_5) {
        a = magnitude[i - width];
        b = magnitude[i + width];
      } else {
        a = magnitude[i - width + 1];
        b = magnitude[i + width - 1];
      }
      if (m >= a && m >= b) thin[i] = m;
    }
  }
  return thin;
}

function hysteresis(
  thin: Float32Array,
  width: number,
  height: number,
  high: number,
): Uint8Array {
  const low = high * 0.4;
  const edges = new Uint8Array(thin.length);
  const stack = new Int32Array(thin.length);
  let top = 0;
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] >= high && !edges[i]) {
      edges[i] = 1;
      stack[top++] = i;
      while (top > 0) {
        const p = stack[--top];
        const px = p % width;
        const py = (p - px) / width;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (!edges[n] && thin[n] >= low) {
              edges[n] = 1;
              stack[top++] = n;
            }
          }
        }
      }
    }
  }
  return edges;
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Labels connected pixels whose mask value equals `value`, returning each
 * component's row extremes: the hull of a component equals the hull of its
 * leftmost and rightmost pixel in every row, at a fraction of the points.
 */
function componentOutlines(
  mask: Uint8Array,
  width: number,
  height: number,
  value: number,
  eightConnected: boolean,
  minPixels: number,
): Point[][] {
  const visited = new Uint8Array(mask.length);
  const seeds = new Int32Array(3 * mask.length + 16);
  const left = new Int32Array(height).fill(width);
  const right = new Int32Array(height).fill(-1);
  const reach = eightConnected ? 1 : 0;
  const outlines: Point[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || visited[start]) continue;
    let count = 0;
    let top = 0;
    let minY = height;
    let maxY = -1;
    seeds[top++] = start;
    while (top > 0) {
      const seed = seeds[--top];
      if (visited[seed]) continue;
      const y = (seed / width) | 0;
      const row = y * width;
      let x0 = seed - row;
      let x1 = x0;
      while (x0 > 0 && mask[row + x0 - 1] === value && !visited[row + x0 - 1])
        x0--;
      while (
        x1 < width - 1 &&
        mask[row + x1 + 1] === value &&
        !visited[row + x1 + 1]
      )
        x1++;
      visited.fill(1, row + x0, row + x1 + 1);
      count += x1 - x0 + 1;
      if (x0 < left[y]) left[y] = x0;
      if (x1 > right[y]) right[y] = x1;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const from = Math.max(0, x0 - reach);
      const to = Math.min(width - 1, x1 + reach);
      for (let ny = y - 1; ny <= y + 1; ny += 2) {
        if (ny < 0 || ny >= height) continue;
        const nrow = ny * width;
        let inRun = false;
        for (let x = from; x <= to; x++) {
          const n = nrow + x;
          const open = mask[n] === value && !visited[n];
          if (open && !inRun) seeds[top++] = n;
          inRun = open;
        }
      }
    }
    const points: Point[] = [];
    for (let y = minY; y <= maxY; y++) {
      if (count >= minPixels && right[y] >= 0) {
        points.push({ x: left[y] + 0.5, y: y + 0.5 });
        if (right[y] !== left[y])
          points.push({ x: right[y] + 0.5, y: y + 0.5 });
      }
      left[y] = width;
      right[y] = -1;
    }
    if (points.length >= 4) outlines.push(points);
  }
  return outlines;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function triangleArea(a: Point, b: Point, c: Point): number {
  return Math.abs(cross(a, b, c)) / 2;
}

/**
 * Largest-area quadrilateral whose corners are hull vertices. For a fixed
 * diagonal the best third vertex on each side is unimodal around a convex
 * hull, so two advancing pointers keep it at O(n²).
 */
function largestInscribedQuad(hull: Point[]): Quad | null {
  const n = hull.length;
  if (n < 4) return null;
  let best: Quad | null = null;
  let bestArea = 0;
  const at = (i: number) => hull[i % n];
  for (let i = 0; i < n; i++) {
    let j = i + 1;
    let l = i + 3;
    for (let k = i + 2; k < i + n - 1; k++) {
      if (j <= i || j >= k) j = i + 1;
      while (
        j + 1 < k &&
        triangleArea(at(i), at(j + 1), at(k)) >=
          triangleArea(at(i), at(j), at(k))
      )
        j++;
      if (l <= k) l = k + 1;
      while (
        l + 1 < i + n &&
        triangleArea(at(k), at(l + 1), at(i)) >=
          triangleArea(at(k), at(l), at(i))
      )
        l++;
      const area =
        triangleArea(at(i), at(j), at(k)) + triangleArea(at(k), at(l), at(i));
      if (area > bestArea) {
        bestArea = area;
        best = [at(i), at(j), at(k), at(l)];
      }
    }
  }
  return best;
}

function cornerAnglesValid(quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const prev = quad[(i + 3) % 4];
    const cur = quad[i];
    const next = quad[(i + 1) % 4];
    const turn = cross(prev, cur, next);
    if (turn === 0) return false;
    if (sign === 0) sign = Math.sign(turn);
    else if (Math.sign(turn) !== sign) return false;
    const ax = prev.x - cur.x;
    const ay = prev.y - cur.y;
    const bx = next.x - cur.x;
    const by = next.y - cur.y;
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)),
        ),
      ),
    );
    if (angle < MIN_CORNER_ANGLE || angle > Math.PI - MIN_CORNER_ANGLE)
      return false;
  }
  return true;
}

/**
 * Gradient level in a band either side of a point on a candidate side,
 * returning the calmer band. A real page edge has a quiet margin or quiet
 * table on at least one side; wood grain and clutter are busy on both.
 */
function calmerBand(
  magnitude: Float32Array,
  width: number,
  height: number,
  px: number,
  py: number,
  nx: number,
  ny: number,
): number {
  let calmest = Infinity;
  for (const direction of [-1, 1]) {
    let sum = 0;
    let count = 0;
    for (const distance of SUPPORT_BAND_DISTANCES) {
      const x = Math.round(px + nx * direction * distance - 0.5);
      const y = Math.round(py + ny * direction * distance - 0.5);
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      sum += magnitude[y * width + x];
      count++;
    }
    if (count > 0) calmest = Math.min(calmest, sum / count);
  }
  return calmest === Infinity ? 0 : calmest;
}

/**
 * Fraction of the quad's perimeter that sits on an isolated step running along
 * the side. Text, shadows and wood grain give edges too, but rarely aligned
 * with the side and rarely with quiet texture beside them. Polarity is judged
 * per side, because lighting can make paper lighter than a white desk on one
 * side and darker on another; agreement all the way round earns a small bonus.
 * The weakest side is weighted in so three good sides cannot carry a fourth
 * that crosses open table.
 */
function orientedSupport(
  quad: Quad,
  gradients: Gradients,
  width: number,
  height: number,
  needed: number,
): number {
  const { gx, gy, magnitude } = gradients;
  const clockwise = cross(quad[0], quad[1], quad[2]) > 0;
  let lighterInside = 0;
  let darkerInside = 0;
  let samples = 0;
  const perSide: [number, number][] = [];
  const sideLengths = quad.map((a, s) => {
    const b = quad[(s + 1) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const perimeter =
    sideLengths[0] + sideLengths[1] + sideLengths[2] + sideLengths[3];
  let supportedSoFar = 0;
  let unscoredLength = perimeter;
  let weakestSoFar = 1;
  for (let s = 0; s < 4; s++) {
    const a = quad[s];
    const b = quad[(s + 1) % 4];
    const length = sideLengths[s];
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const inX = clockwise ? -uy : uy;
    const inY = clockwise ? ux : -ux;
    const steps = Math.max(4, Math.round(length));
    let sideLighter = 0;
    let sideDarker = 0;
    for (let t = 1; t < steps; t++) {
      const px = a.x + ((b.x - a.x) * t) / steps;
      const py = a.y + ((b.y - a.y) * t) / steps;
      samples++;
      let strongest = 0;
      for (let o = -1.5; o <= 1.5; o += 0.75) {
        const x = Math.round(px + inX * o - 0.5);
        const y = Math.round(py + inY * o - 0.5);
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        const i = y * width + x;
        const along = gx[i] * inX + gy[i] * inY;
        const across = Math.abs(gx[i] * ux + gy[i] * uy);
        if (
          Math.abs(along) >= SUPPORT_MIN_STEP &&
          Math.abs(along) >= 2 * across &&
          Math.abs(along) > Math.abs(strongest)
        ) {
          strongest = along;
        }
      }
      if (
        strongest !== 0 &&
        Math.abs(strongest) <
          SUPPORT_TEXTURE_RATIO *
            calmerBand(magnitude, width, height, px, py, inX, inY)
      ) {
        strongest = 0;
      }
      if (strongest > 0) sideLighter++;
      else if (strongest < 0) sideDarker++;
    }
    lighterInside += sideLighter;
    darkerInside += sideDarker;
    perSide.push([sideLighter / (steps - 1), sideDarker / (steps - 1)]);
    const fraction = Math.max(sideLighter, sideDarker) / (steps - 1);
    supportedSoFar += fraction * length;
    unscoredLength -= length;
    weakestSoFar = Math.min(weakestSoFar, fraction);
    const bestPossible =
      ((supportedSoFar + unscoredLength) / perimeter) * 0.7 +
      weakestSoFar * 0.3;
    if (bestPossible < needed) return 0;
  }
  if (samples === 0) return 0;
  let supported = 0;
  let weakestSide = 1;
  for (let s = 0; s < 4; s++) {
    const fraction = Math.max(perSide[s][0], perSide[s][1]);
    weakestSide = Math.min(weakestSide, fraction);
    supported += fraction * sideLengths[s];
  }
  const overall = supported / perimeter;
  const hits = lighterInside + darkerInside;
  const consistency =
    hits === 0 ? 0 : Math.max(lighterInside, darkerInside) / hits;
  return (
    (overall * 0.7 + weakestSide * 0.3) *
    (1 - POLARITY_WEIGHT + POLARITY_WEIGHT * consistency)
  );
}

/** Orders corners clockwise in image space, starting from the one nearest the top-left. */
function orderCorners(points: Point[]): DocumentCorners {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const clockwise = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (
      clockwise[i].x + clockwise[i].y <
      clockwise[start].x + clockwise[start].y
    )
      start = i;
  }
  const at = (k: number) => clockwise[(start + k) % 4];
  return {
    topLeft: at(0),
    topRight: at(1),
    bottomRight: at(2),
    bottomLeft: at(3),
  };
}

function cornersToQuad(corners: DocumentCorners): Quad {
  return [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];
}

interface Line {
  /** Unit normal and offset: points p on the line satisfy nx·p.x + ny·p.y = c. */
  nx: number;
  ny: number;
  c: number;
}

function fitLine(points: Point[]): Line | null {
  if (points.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
}

function intersect(a: Line, b: Line): Point | null {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (a.c * b.ny - a.ny * b.c) / det,
    y: (a.nx * b.c - a.c * b.nx) / det,
  };
}

const HOUGH_ANGLE_BINS = 180;
const HOUGH_VOTE_SPREAD = 3;
const HOUGH_MIN_MAGNITUDE = 8;
const HOUGH_MIN_VOTES_FRACTION = 0.35;
const HOUGH_MAX_LINES = 20;

/**
 * Straight lines through the edge pixels, strongest first. Each pixel votes
 * only near its own gradient direction, which keeps the accumulator clean
 * enough to read lines that a pen or a cable cuts into pieces.
 */
function houghLines(
  thin: Float32Array,
  gradients: Gradients,
  width: number,
  height: number,
): Line[] {
  const maxRho = Math.ceil(Math.hypot(width, height));
  const rhoBins = 2 * maxRho + 1;
  const accumulator = new Float32Array(HOUGH_ANGLE_BINS * rhoBins);
  const cos = new Float32Array(HOUGH_ANGLE_BINS);
  const sin = new Float32Array(HOUGH_ANGLE_BINS);
  for (let a = 0; a < HOUGH_ANGLE_BINS; a++) {
    cos[a] = Math.cos((a * Math.PI) / HOUGH_ANGLE_BINS);
    sin[a] = Math.sin((a * Math.PI) / HOUGH_ANGLE_BINS);
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (thin[i] < HOUGH_MIN_MAGNITUDE) continue;
      let angle = Math.atan2(gradients.gy[i], gradients.gx[i]);
      if (angle < 0) angle += Math.PI;
      const center = Math.round((angle * HOUGH_ANGLE_BINS) / Math.PI);
      for (let d = -HOUGH_VOTE_SPREAD; d <= HOUGH_VOTE_SPREAD; d++) {
        const a =
          (((center + d) % HOUGH_ANGLE_BINS) + HOUGH_ANGLE_BINS) %
          HOUGH_ANGLE_BINS;
        const rho = (x + 0.5) * cos[a] + (y + 0.5) * sin[a] + maxRho;
        const r0 = Math.floor(rho);
        const f = rho - r0;
        accumulator[a * rhoBins + r0] += 1 - f;
        accumulator[a * rhoBins + r0 + 1] += f;
      }
    }
  }

  // Angle bins wrap at 180°, where the same line reappears with its distance
  // negated; neighbourhoods must cross that seam or near-vertical lines split
  // into two half-strength peaks.
  const binIndex = (a: number, r: number): number => {
    if (a < 0 || a >= HOUGH_ANGLE_BINS) {
      a = (a + HOUGH_ANGLE_BINS) % HOUGH_ANGLE_BINS;
      r = rhoBins - 1 - r;
    }
    return r < 0 || r >= rhoBins ? -1 : a * rhoBins + r;
  };

  // An edge that steps between pixel rows spreads its votes over neighbouring
  // bins; summing a 3×3 window lets it register as the one line it is.
  const smoothed = new Float32Array(accumulator.length);
  for (let a = 0; a < HOUGH_ANGLE_BINS; a++) {
    const seam = a === 0 || a === HOUGH_ANGLE_BINS - 1;
    for (let r = 1; r < rhoBins - 1; r++) {
      let sum = 0;
      if (seam) {
        for (let da = -1; da <= 1; da++) {
          for (let dr = -1; dr <= 1; dr++) {
            const k = binIndex(a + da, r + dr);
            if (k >= 0) sum += accumulator[k];
          }
        }
      } else {
        for (let da = -1; da <= 1; da++) {
          const k = (a + da) * rhoBins + r;
          sum += accumulator[k - 1] + accumulator[k] + accumulator[k + 1];
        }
      }
      smoothed[a * rhoBins + r] = sum;
    }
  }

  const peaks: { a: number; r: number; votes: number }[] = [];
  const minVotes = Math.min(width, height) * HOUGH_MIN_VOTES_FRACTION;
  for (let a = 0; a < HOUGH_ANGLE_BINS; a++) {
    for (let r = 1; r < rhoBins - 1; r++) {
      const v = smoothed[a * rhoBins + r];
      if (v < minVotes) continue;
      let isPeak = true;
      for (let da = -2; da <= 2 && isPeak; da++) {
        for (let dr = -2; dr <= 2; dr++) {
          if (da === 0 && dr === 0) continue;
          const k = binIndex(a + da, r + dr);
          if (k >= 0 && smoothed[k] > v) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) peaks.push({ a, r, votes: v });
    }
  }
  peaks.sort((p, q) => q.votes - p.votes);

  const lines: { line: Line; a: number; r: number }[] = [];
  for (const peak of peaks) {
    const duplicate = lines.some(({ a, r }) => {
      const direct = Math.abs(a - peak.a);
      if (direct <= 5) return Math.abs(r - peak.r) <= 4;
      return (
        HOUGH_ANGLE_BINS - direct <= 5 &&
        Math.abs(rhoBins - 1 - r - peak.r) <= 4
      );
    });
    if (duplicate) continue;
    lines.push({
      line: { nx: cos[peak.a], ny: sin[peak.a], c: peak.r - maxRho },
      a: peak.a,
      r: peak.r,
    });
    if (lines.length >= HOUGH_MAX_LINES) break;
  }
  return lines.map(({ line }) => line);
}

function angleBetween(a: Line, b: Line): number {
  const dot = Math.abs(a.nx * b.nx + a.ny * b.ny);
  return Math.acos(Math.min(1, dot));
}

/** Quads bounded by two roughly parallel pairs of lines, all corners inside the frame. */
function lineQuads(lines: Line[], width: number, height: number): Quad[] {
  const maxSkew = (35 * Math.PI) / 180;
  const minCrossing = (50 * Math.PI) / 180;
  const pairs: [Line, Line][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (angleBetween(lines[i], lines[j]) <= maxSkew)
        pairs.push([lines[i], lines[j]]);
    }
  }
  const margin = 0.02 * Math.max(width, height);
  const inside = (p: Point) =>
    p.x >= -margin &&
    p.y >= -margin &&
    p.x <= width + margin &&
    p.y <= height + margin;
  const quads: Quad[] = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a1, a2] = pairs[i];
      const [b1, b2] = pairs[j];
      if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue;
      if (angleBetween(a1, b1) < minCrossing) continue;
      const corners = [
        intersect(a1, b1),
        intersect(b1, a2),
        intersect(a2, b2),
        intersect(b2, a1),
      ];
      if (corners.some((p) => !p || !inside(p))) continue;
      const quad = corners.map((p) => ({
        x: Math.max(0, Math.min(width, p!.x)),
        y: Math.max(0, Math.min(height, p!.y)),
      })) as Quad;
      if (cornerAnglesValid(quad)) quads.push(quad);
    }
  }
  return quads;
}

/** Samples at continuous coordinates, where pixel `i` covers [i, i + 1) and its centre is i + 0.5. */
function sampleBilinear(
  values: Float32Array,
  width: number,
  height: number,
  px: number,
  py: number,
): number {
  const x = px - 0.5;
  const y = py - 0.5;
  const x0 = Math.max(0, Math.min(width - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const i = y0 * width + x0;
  return (
    values[i] * (1 - fx) * (1 - fy) +
    values[i + 1] * fx * (1 - fy) +
    values[i + width] * (1 - fx) * fy +
    values[i + width + 1] * fx * fy
  );
}

/**
 * Moves each side onto the strongest intensity step along its normal, then
 * re-intersects the sides. `corners` are in `image` pixels; `searchRadius`
 * bounds how far a side may move. Returns the input when a side finds too
 * little evidence, so refinement never makes a detection worse by guessing.
 */
export function refineCorners(
  image: RgbaImage,
  corners: DocumentCorners,
  searchRadius: number,
): DocumentCorners {
  return refineOnGray(blur(toGray(image)), corners, searchRadius);
}

function refineOnGray(
  gray: GrayImage,
  corners: DocumentCorners,
  searchRadius: number,
): DocumentCorners {
  const { width, height } = gray;
  const quad = cornersToQuad(corners);
  const lines: Line[] = [];
  for (let s = 0; s < 4; s++) {
    const a = quad[s];
    const b = quad[(s + 1) % 4];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 4) return corners;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const nx = -uy;
    const ny = ux;
    const samples = Math.max(8, Math.min(200, Math.round(length / 2)));
    const found: Point[] = [];
    for (let t = 1; t < samples; t++) {
      const along = (t / samples) * 0.8 + 0.1;
      const px = a.x + (b.x - a.x) * along;
      const py = a.y + (b.y - a.y) * along;
      let bestStep = 0;
      let bestOffset = 0;
      const steps: number[] = [];
      for (let o = -searchRadius; o <= searchRadius; o++) {
        const x1 = px + nx * (o - 0.5);
        const y1 = py + ny * (o - 0.5);
        const x2 = px + nx * (o + 0.5);
        const y2 = py + ny * (o + 0.5);
        if (
          x1 < 1 ||
          y1 < 1 ||
          x2 < 1 ||
          y2 < 1 ||
          x1 > width - 2 ||
          x2 > width - 2 ||
          y1 > height - 2 ||
          y2 > height - 2
        ) {
          steps.push(0);
          continue;
        }
        const step = Math.abs(
          sampleBilinear(gray.data, width, height, x2, y2) -
            sampleBilinear(gray.data, width, height, x1, y1),
        );
        steps.push(step);
        if (step > bestStep) {
          bestStep = step;
          bestOffset = o;
        }
      }
      if (bestStep < 8) continue;
      const k = bestOffset + searchRadius;
      let sub = 0;
      if (k > 0 && k < steps.length - 1) {
        const denom = steps[k - 1] - 2 * steps[k] + steps[k + 1];
        if (denom < 0) sub = (0.5 * (steps[k - 1] - steps[k + 1])) / denom;
      }
      found.push({
        x: px + nx * (bestOffset + sub),
        y: py + ny * (bestOffset + sub),
      });
    }
    if (found.length < Math.max(4, samples * 0.3)) return corners;
    let line = fitLine(found);
    if (!line) return corners;
    const residuals = found.map((p) =>
      Math.abs(line!.nx * p.x + line!.ny * p.y - line!.c),
    );
    const sortedResiduals = [...residuals].sort((x, y) => x - y);
    const cutoff = Math.max(
      0.75,
      2.5 * sortedResiduals[Math.floor(sortedResiduals.length / 2)],
    );
    const inliers = found.filter((_, i) => residuals[i] <= cutoff);
    if (inliers.length < Math.max(4, samples * 0.25)) return corners;
    line = fitLine(inliers);
    if (!line) return corners;
    lines.push(line);
  }
  const refined: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const p = intersect(lines[(i + 3) % 4], lines[i]);
    if (!p) return corners;
    const original = quad[i];
    if (Math.hypot(p.x - original.x, p.y - original.y) > searchRadius * 2.5)
      return corners;
    refined.push(p);
  }
  if (!cornerAnglesValid(refined as Quad)) return corners;
  return orderCorners(refined);
}

/** 1 at the frame centre, falling to 0.6 at a corner: the user aims at the page they want. */
function centrality(quad: Quad, width: number, height: number): number {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4 / width - 0.5;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4 / height - 0.5;
  return 1 - 0.8 * (cx * cx + cy * cy);
}

/**
 * Detects the most document-like quadrilateral in `image`, or `null` when no
 * candidate is convex, large enough and outlined by real edges. Corners are in
 * `image` pixels. Cost grows with pixel count: around 240 px wide keeps a
 * frame to a few milliseconds on a laptop, which live preview needs.
 */
export function detectDocument(image: RgbaImage): DocumentCorners | null {
  const { width, height } = image;
  const gray = blur(toGray(image));
  const neutrality = neutralityChannel(image);
  const gradients = paperGradients(image, gray, neutrality);
  const thin = nonMaximumSuppression(gradients, width, height);
  const imageArea = width * height;
  const minPixels = Math.max(
    16,
    Math.round(imageArea * MIN_AREA_FRACTION * 0.25),
  );

  const outlines: Point[][] = [];
  for (const high of CANNY_HIGH_THRESHOLDS) {
    const closed = dilate(hysteresis(thin, width, height, high), width, height);
    outlines.push(
      ...componentOutlines(closed, width, height, 0, false, minPixels),
      ...componentOutlines(
        closed,
        width,
        height,
        1,
        true,
        Math.round(minPixels / 8),
      ),
    );
  }
  for (const channel of [gray, neutrality]) {
    const threshold = otsuThreshold(channel.data);
    const above = new Uint8Array(channel.data.length);
    for (let i = 0; i < above.length; i++)
      above[i] = channel.data[i] > threshold ? 1 : 0;
    outlines.push(
      ...componentOutlines(above, width, height, 1, false, minPixels),
      ...componentOutlines(above, width, height, 0, false, minPixels),
    );
  }

  const quads = lineQuads(
    houghLines(thin, gradients, width, height),
    width,
    height,
  );
  for (const outline of outlines) {
    const hull = convexHull(outline);
    if (polygonArea(hull) < imageArea * MIN_AREA_FRACTION) continue;
    const quad = largestInscribedQuad(hull);
    if (quad && cornerAnglesValid(quad)) quads.push(quad);
  }

  let best: Quad | null = null;
  let bestScore = 0;
  for (const quad of quads) {
    const area = polygonArea(quad);
    if (area < imageArea * MIN_AREA_FRACTION || area > imageArea * 0.98)
      continue;
    const prior = Math.sqrt(area / imageArea) * centrality(quad, width, height);
    const needed = Math.max(
      MIN_EDGE_SUPPORT,
      Math.sqrt(bestScore / prior) * (1 - 1e-9),
    );
    const support = orientedSupport(quad, gradients, width, height, needed);
    if (support < MIN_EDGE_SUPPORT) continue;
    const score = support * support * prior;
    if (score > bestScore) {
      bestScore = score;
      best = quad;
    }
  }
  return best ? refineOnGray(gray, orderCorners(best), 2) : null;
}
