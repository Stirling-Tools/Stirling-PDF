import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { PageRect, RGBA } from "@app/tools/pdfTextEditor/types";

// Render the area of the page surrounding a text run and pick the dominant
// background color.
const MARGIN_POINTS = 6;
const SAMPLE_SCALE = 1.5; // bitmap resolution (px per PDF point)
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };

export interface SampleResult {
  fill: RGBA;
  /** True when the sampler found at least one consensus background pixel. */
  confident: boolean;
}

interface Slice {
  /** Display-space point at the bitmap's top-left pixel. */
  left: number;
  top: number;
  scale: number;
  rgba: Uint8Array;
  width: number;
  height: number;
  stride: number;
}

// Rasterize `bounds` grown by `margin` points; null when it has no area.
function renderSlice(
  m: WrappedPdfiumModule,
  page: Page,
  bounds: PageRect,
  margin: number,
  scale = SAMPLE_SCALE,
): Slice | null {
  // No flush needed: the render path draws from the in-memory object list.
  // The rendered bitmap is CropBox/rotation (display) space; the run bounds
  // are raw PDF.
  const d = page.display;
  const cs = [
    d.apply(bounds.x, bounds.y),
    d.apply(bounds.x + bounds.width, bounds.y),
    d.apply(bounds.x, bounds.y + bounds.height),
    d.apply(bounds.x + bounds.width, bounds.y + bounds.height),
  ];
  const left = Math.max(0, Math.min(...cs.map((c) => c.x)) - margin);
  const right = Math.min(page.width, Math.max(...cs.map((c) => c.x)) + margin);
  const top = Math.min(page.height, Math.max(...cs.map((c) => c.y)) + margin);
  const bottom = Math.max(0, Math.min(...cs.map((c) => c.y)) - margin);
  const widthPts = right - left;
  const heightPts = top - bottom;
  if (widthPts <= 1 || heightPts <= 1) return null;

  const w = Math.max(8, Math.round(widthPts * scale));
  const h = Math.max(8, Math.round(heightPts * scale));
  const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
  if (!bitmapPtr) return null;
  try {
    m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
    // PDFium renders the WHOLE page sized to (pageW*scale, pageH*scale)
    // at the bitmap's origin. We translate so our slice lands at 0,0.
    const fullW = Math.round(page.width * scale);
    const fullH = Math.round(page.height * scale);
    const startX = -Math.round(left * scale);
    // CSS-style y: PDFium origin is page top-left in render coords.
    const startY = -Math.round((page.height - top) * scale);
    // 0x01 = FPDF_ANNOT, 0x10 = FPDF_REVERSE_BYTE_ORDER (gives RGBA).
    m.FPDF_RenderPageBitmap(
      bitmapPtr,
      page.pagePtr,
      startX,
      startY,
      fullW,
      fullH,
      0,
      0x01 | 0x10,
    );
    const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
    const stride = m.FPDFBitmap_GetStride(bitmapPtr);
    const heap = new Uint8Array(
      (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory }).memory
        .buffer,
      bufferPtr,
      stride * h,
    );
    return {
      left,
      top,
      scale,
      rgba: heap.slice(),
      width: w,
      height: h,
      stride,
    };
  } finally {
    m.FPDFBitmap_Destroy(bitmapPtr);
  }
}

export function sampleBackground(
  m: WrappedPdfiumModule,
  page: Page,
  bounds: PageRect,
): SampleResult {
  const fallback: RGBA = { r: 255, g: 255, b: 255, a: 255 };
  try {
    const slice = renderSlice(m, page, bounds, MARGIN_POINTS);
    if (!slice) return { fill: fallback, confident: false };
    const { rgba: heap, width: w, height: h, stride } = slice;

    // Sample the border rings (top, bottom, left, right) plus the
    // four corners. Bucket by 4 bits per channel.
    const buckets = new Map<
      number,
      { r: number; g: number; b: number; count: number }
    >();
    const ringWidth = 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inTop = y < ringWidth;
        const inBottom = y >= h - ringWidth;
        const inLeft = x < ringWidth;
        const inRight = x >= w - ringWidth;
        if (!(inTop || inBottom || inLeft || inRight)) continue;
        const off = y * stride + x * 4;
        const r = heap[off];
        const g = heap[off + 1];
        const b = heap[off + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count += 1;
        buckets.set(key, bucket);
      }
    }
    let best: { r: number; g: number; b: number; count: number } | null = null;
    for (const b of buckets.values()) {
      if (!best || b.count > best.count) best = b;
    }
    if (!best || best.count === 0) return { fill: fallback, confident: false };
    return {
      fill: {
        r: Math.round(best.r / best.count),
        g: Math.round(best.g / best.count),
        b: Math.round(best.b / best.count),
        a: 255,
      },
      confident: true,
    };
  } catch {
    return { fill: fallback, confident: false };
  }
}

const luma = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;

export interface ScanInk {
  fill: RGBA;
  /** Box around the scanned glyphs and their blur, raw page space. */
  rect: PageRect;
  /** The glyphs' solid body without the blur: what the letters measure. */
  body: PageRect;
  /** Where the glyph bodies sit, or null when the rows give no clear edge. */
  baseline: number | null;
  /** Top of the lowercase band (the x-height), or null when the rows show none. */
  xLine: number | null;
  /** The darkest ink: the colour before the scan's blur lightened it. */
  core: RGBA;
  /** The paper around the glyphs: what a cover over them should be. */
  paper: RGBA;
  /** Share of the ink box that is solid ink: how heavy the strokes are. */
  density: number;
  /** Centre x of each separate glyph, raw page space, left to right. */
  glyphCenters: number[];
  /** A box edge sits just left / right of the glyphs (OCR may read it as "["). */
  edgeLeft: boolean;
  edgeRight: boolean;
}

/** Where to look: an x span and the rows the OCR says hold the glyphs. */
export interface ScanRegion {
  x0: number;
  x1: number;
  bottom: number;
  top: number;
}

// Finer than the background pass: scanned body text is often 5pt tall.
export const INK_SCALE = 4;

// Scanned glyphs inside `region`: their colour, true extent and baseline. OCR
// boxes often clip ascenders and descenders, which then peek out of a cover.
export function measureScanInk(
  m: WrappedPdfiumModule,
  page: Page,
  region: ScanRegion,
): ScanInk | null {
  try {
    const d = page.display;
    const o = d.apply(0, 0);
    const ux = d.apply(1, 0);
    const uy = d.apply(0, 1);
    // Rows of the bitmap only line up with text rows on an upright page.
    if (Math.abs(ux.y - o.y) > 1e-6 || ux.x - o.x <= 0 || uy.y - o.y <= 0)
      return null;
    const boxH = region.top - region.bottom;
    const box = {
      x: region.x0,
      y: region.bottom,
      width: region.x1 - region.x0,
      height: boxH,
    };
    const slice = renderSlice(m, page, box, Math.max(boxH * 1.5, 6), INK_SCALE);
    if (!slice) return null;
    const { rgba, width, height, stride, scale } = slice;
    const toPxX = (x: number) =>
      Math.round((d.apply(x, 0).x - slice.left) * scale);
    const toPxY = (y: number) =>
      Math.round((slice.top - d.apply(0, y).y) * scale);
    const x0 = Math.max(0, toPxX(region.x0));
    const x1 = Math.min(width - 1, toPxX(region.x1));
    const coreTop = Math.max(0, toPxY(region.top));
    const coreBottom = Math.min(height - 1, toPxY(region.bottom));
    if (x1 <= x0 || coreBottom < coreTop) return null;
    // The paper is what most of the slice is. Sampled from a ring instead, a
    // ruled line under the ring passed for paper and hid every thin stroke.
    const sample: number[] = [];
    for (let y = 0; y < height; y += 2)
      for (let x = x0; x <= x1; x += 2) {
        const i = y * stride + x * 4;
        sample.push(luma(rgba[i], rgba[i + 1], rgba[i + 2]));
      }
    sample.sort((p, q) => p - q);
    // Bright enough to clear the ink, not so bright that grain sets it.
    const paper = sample[Math.floor(sample.length * 0.75)] ?? 255;
    // Faint anti-aliased edges still show once the paper around them is
    // covered, so the extent uses a softer cut than the colour does.
    const ink = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * stride + x * 4;
        const l = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
        ink[y * width + x] = l < paper - 60 ? 2 : l < paper - 30 ? 1 : 0;
      }
    }
    // The cover colour is the paper itself: every pixel clear of ink, with a
    // pixel's margin, averaged. Grain averages out; ink and its blur stay out.
    const paperRgb = [0, 0, 0];
    let paperN = 0;
    for (let y = 1; y < height - 1; y++)
      for (let x = x0 + 1; x < x1; x++) {
        if (
          ink[y * width + x] ||
          ink[y * width + x - 1] ||
          ink[y * width + x + 1] ||
          ink[(y - 1) * width + x] ||
          ink[(y + 1) * width + x]
        )
          continue;
        const i = y * stride + x * 4;
        paperRgb[0] += rgba[i];
        paperRgb[1] += rgba[i + 1];
        paperRgb[2] += rgba[i + 2];
        paperN++;
      }
    const span = x1 - x0 + 1;
    const rowInk = new Array<number>(height).fill(0);
    const rowSolid = new Array<number>(height).fill(0);
    const ruled = new Uint8Array(height);
    const countRows = () => {
      rowInk.fill(0);
      rowSolid.fill(0);
      ruled.fill(0);
      for (let y = 0; y < height; y++)
        for (let x = x0; x <= x1; x++) {
          const v = ink[y * width + x];
          if (v) rowInk[y]++;
          if (v === 2) rowSolid[y]++;
        }
      // A row solidly inked edge to edge is a ruled line or box border; its
      // blurred fringe is not, or glyphs touching the rule would stop short.
      for (let y = 0; y < height; y++) {
        if (span <= 12 || rowSolid[y] <= span * 0.85) continue;
        for (let k = y - 3; k <= y + 3; k++)
          if (k >= 0 && k < height && (k === y || rowInk[k] > span * 0.3))
            ruled[k] = 1;
      }
    };
    countRows();
    // A column inked all the way between the rules around the text (or the
    // whole slice) is a box edge, however tight the box: no glyph spans it.
    const mid = Math.round((coreTop + coreBottom) / 2);
    let above = mid;
    while (above > 0 && !ruled[above]) above--;
    let below = mid;
    while (below < height - 1 && !ruled[below]) below++;
    const edgeCols: number[] = [];
    const interior = below - above - 1;
    for (let x = x0; x <= x1 && interior > 4; x++) {
      let n = 0;
      for (let y = above + 1; y < below; y++) if (ink[y * width + x]) n++;
      if (n < interior * 0.9) continue;
      edgeCols.push(x);
      for (let y = 0; y < height; y++) ink[y * width + x] = 0;
    }
    if (edgeCols.length) countRows();
    const isRule = (y: number) => ruled[y] === 1;
    let first = -1;
    let last = -1;
    for (let y = coreTop; y <= coreBottom; y++) {
      if (rowSolid[y] === 0 || isRule(y)) continue;
      if (first < 0) first = y;
      last = y;
    }
    if (first < 0) return null;
    // Grow past the OCR box until a clear gap: i-dots sit a row or two off,
    // while a wider gap would reach into the neighbouring line.
    const gap = Math.round(scale * 0.8);
    const boxPx = coreBottom - coreTop;
    const grow = (from: number, step: number, limit: number) => {
      let edge = from;
      let blank = 0;
      for (
        let y = from + step;
        y >= 0 && y < height && Math.abs(y - from) <= limit;
        y += step
      ) {
        if (isRule(y)) break;
        if (rowSolid[y] > 0) {
          edge = y;
          blank = 0;
        } else if (++blank > gap) break;
      }
      return edge;
    };
    // Solid rows set the extent; the blur around them, up to 2pt, rides along.
    const fringe = (from: number, step: number) => {
      let y = from;
      for (let k = 0; k < scale * 2; k++) {
        const n = y + step;
        // Stop a few rows short of a rule: its own blur is not the glyphs'.
        const nearRule = [0, 1, 2, 3].some((k) => isRule(n + k * step));
        if (n < 0 || n >= height || rowInk[n] === 0 || nearRule) break;
        y = n;
      }
      return y;
    };
    const solidTop = grow(first, -1, boxPx * 0.6);
    const solidBottom = grow(last, 1, boxPx * 0.7);
    const top = fringe(solidTop, -1);
    const bottom = fringe(solidBottom, 1);

    // Glyph bodies end on the baseline and only descenders go below it, so
    // the baseline is where the ink per row falls away most sharply. A fixed
    // share of the peak misses it on thin, light strokes.
    const ink2 = (y: number) => (rowInk[y] ?? 0) + (rowInk[y - 1] ?? 0);
    let baseRow = bottom + 1;
    let drop = -1;
    for (let y = Math.round(top + (bottom - top) * 0.4); y <= bottom; y++) {
      const d = ink2(y) - ink2(y + 2);
      if (d > drop) {
        drop = d;
        baseRow = y + 1;
      }
    }
    // Lowercase text is densest between the baseline and its x-height; the
    // top of that band is where ink rises most sharply going down.
    let xRow = top;
    let rise = -1;
    for (let y = top + 1; y <= baseRow - (baseRow - top) * 0.3; y++) {
      const r = ink2(y + 1) - ink2(y - 1);
      if (r > rise) {
        rise = r;
        xRow = y;
      }
    }
    // A real lowercase band is several times denser than the ascenders above
    // it and fills about two thirds of the glyph height. Capitals fill it all,
    // or leave only empty blur above, which reads as a band with no ascenders.
    const mean = (a: number, b: number) => {
      let sum = 0;
      for (let y = a; y < b; y++) sum += rowInk[y];
      return b > a ? sum / (b - a) : 0;
    };
    const band = (baseRow - xRow) / Math.max(1, baseRow - top);
    const density = mean(xRow, baseRow) / Math.max(0.1, mean(top, xRow));
    const lowercaseBand =
      band > 0.5 && band < 0.75 && density > 2 && density < 15;

    const colInk = (x: number) => {
      for (let y = top; y <= bottom; y++)
        if (ink[y * width + x] === 2) return true;
      return false;
    };
    const colSoft = (x: number) => {
      for (let y = top; y <= bottom; y++) if (ink[y * width + x]) return true;
      return false;
    };
    let left = x0;
    while (left <= x1 && !colInk(left)) left++;
    let right = x1;
    while (right >= left && !colInk(right)) right--;
    if (left > right) return null;
    // Soft fringe past the solid ink still needs covering.
    const solidLeft = left;
    const solidRight = right;
    while (left > x0 && colSoft(left - 1)) left--;
    while (right < x1 && colSoft(right + 1)) right++;

    // Separate glyphs: runs of solid columns split by at least one blank.
    const centers: number[] = [];
    let runStart = -1;
    for (let x = left; x <= right + 1; x++) {
      const on = x <= right && colInk(x);
      if (on && runStart < 0) runStart = x;
      if (!on && runStart >= 0) {
        centers.push((runStart + x - 1) / 2);
        runStart = -1;
      }
    }

    const dark: Array<[number, number, number, number]> = [];
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (ink[y * width + x] !== 2) continue;
        const i = y * stride + x * 4;
        const px = [rgba[i], rgba[i + 1], rgba[i + 2]] as const;
        dark.push([luma(...px), ...px]);
      }
    }
    // Pixel rows/cols back to raw page space through the display map.
    const pageX = (px: number) =>
      (slice.left + px / scale - o.x) / (ux.x - o.x);
    const pageY = (py: number) => (slice.top - py / scale - o.y) / (uy.y - o.y);
    // A little extra cover for anti-aliasing, but never onto a rule or edge.
    const clearance = (
      from: number,
      step: number,
      blocked: (i: number) => boolean,
    ) => {
      const want = Math.round(scale * 0.4);
      // A rule right against the glyphs pulls the edge in a row, since a
      // cover's anti-aliased edge would otherwise grey the rule's last row.
      if (blocked(from + step)) return -1;
      const near = (k: number) =>
        [0, 1, 2].some((j) => blocked(from + (k + j) * step));
      for (let k = 1; k <= want; k++) if (near(k)) return k - 1;
      return want;
    };
    const pageBox = (t: number, b: number, l: number, r: number) => {
      const ys = [pageY(t), pageY(b + 1)];
      const xs = [pageX(l), pageX(r + 1)];
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.abs(xs[1] - xs[0]),
        height: Math.abs(ys[1] - ys[0]),
      };
    };
    return {
      fill: dark.length ? inkColour(dark, 0.4) : BLACK,
      core: dark.length ? inkColour(dark, 0.08) : BLACK,
      paper: {
        r: Math.round(paperRgb[0] / Math.max(1, paperN)),
        g: Math.round(paperRgb[1] / Math.max(1, paperN)),
        b: Math.round(paperRgb[2] / Math.max(1, paperN)),
        a: 255,
      },
      rect: pageBox(
        top - clearance(top, -1, (y) => ruled[y] === 1),
        bottom + clearance(bottom, 1, (y) => ruled[y] === 1),
        left - clearance(left, -1, (x) => edgeCols.includes(x)),
        right + clearance(right, 1, (x) => edgeCols.includes(x)),
      ),
      body: pageBox(solidTop, solidBottom, solidLeft, solidRight),
      baseline: pageY(baseRow),
      xLine: lowercaseBand ? pageY(xRow) : null,
      density: dark.length / ((right - left + 1) * (bottom - top + 1)),
      glyphCenters: centers.map((c) => pageX(c + 0.5)),
      edgeLeft: edgeCols.some(
        (c) => c < solidLeft && solidLeft - c < scale * 6,
      ),
      edgeRight: edgeCols.some(
        (c) => c > solidRight && c - solidRight < scale * 6,
      ),
    };
  } catch {
    return null;
  }
}

/** A copy of the page's pixels over `rect`, to move scanned words around. */
export interface PixelPatch {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** The page area the pixels cover, raw page space. */
  rect: PageRect;
}

export function capturePatch(
  m: WrappedPdfiumModule,
  page: Page,
  rect: PageRect,
): PixelPatch | null {
  try {
    const d = page.display;
    const o = d.apply(0, 0);
    const ux = d.apply(1, 0);
    const uy = d.apply(0, 1);
    // Display space must be raw page space shifted, or the copy lands skewed.
    if (ux.x - o.x !== 1 || uy.y - o.y !== 1 || ux.y !== o.y) return null;
    const slice = renderSlice(m, page, rect, 0, INK_SCALE);
    if (!slice) return null;
    const { width, height, stride, scale } = slice;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      rgba.set(
        slice.rgba.subarray(y * stride, y * stride + width * 4),
        y * width * 4,
      );
    return {
      rgba,
      width,
      height,
      rect: {
        x: slice.left - o.x,
        y: slice.top - height / scale - o.y,
        width: width / scale,
        height: height / scale,
      },
    };
  } catch {
    return null;
  }
}

/** Luma of a page area at the ink-measuring resolution, softened by `blur` px. */
export function renderLuma(
  m: WrappedPdfiumModule,
  page: Page,
  rect: PageRect,
  blur = 2,
): { data: Float32Array; width: number; height: number } | null {
  try {
    const slice = renderSlice(m, page, rect, 0, INK_SCALE);
    if (!slice) return null;
    const { rgba, width, height, stride } = slice;
    let data = new Float32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * stride + x * 4;
        data[y * width + x] = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
      }
    // Box blur rows then columns: scans are soft, drawn text is crisp.
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const out = new Float32Array(data.length);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          let sum = 0;
          let n = 0;
          for (let k = -blur; k <= blur; k++) {
            const xx = x + k * dx;
            const yy = y + k * dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            sum += data[yy * width + xx];
            n++;
          }
          out[y * width + x] = sum / n;
        }
      data = out;
    }
    return { data, width, height };
  } catch {
    return null;
  }
}

// The darker part of the ink pixels: glyph edges anti-alias toward the paper,
// yet the darkest few alone read blacker than the scan looks.
function inkColour(
  dark: Array<[number, number, number, number]>,
  share: number,
): RGBA {
  dark.sort((a, b) => a[0] - b[0]);
  const take = dark.slice(0, Math.max(1, Math.round(dark.length * share)));
  const avg = (i: 1 | 2 | 3) =>
    Math.round(take.reduce((sum, p) => sum + p[i], 0) / take.length);
  return { r: avg(1), g: avg(2), b: avg(3), a: 255 };
}
