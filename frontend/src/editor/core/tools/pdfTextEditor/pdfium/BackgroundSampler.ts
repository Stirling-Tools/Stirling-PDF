import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageRect, RGBA } from "@editor/tools/pdfTextEditor/types";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { luma } from "@editor/tools/pdfTextEditor/model/Color";
import { boxBlur } from "@editor/tools/pdfTextEditor/util/boxBlur";

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
  /** Crop-space point at the bitmap's top-left pixel. */
  left: number;
  top: number;
  scale: number;
  rgba: Uint8Array;
  width: number;
  height: number;
  stride: number;
}

function rawView(page: Page): DisplayTransform {
  const d = page.display;
  return DisplayTransform.fromCropAndRotate(
    d.cropLeft,
    d.cropBottom,
    d.cropWidth,
    d.cropHeight,
    0,
    d.cropWidth,
    d.cropHeight,
  );
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
  // The bitmap is raw PDF space cropped to the CropBox with /Rotate undone, so rows run along the page's x axis.
  const d = rawView(page);
  const cs = [
    d.apply(bounds.x, bounds.y),
    d.apply(bounds.x + bounds.width, bounds.y),
    d.apply(bounds.x, bounds.y + bounds.height),
    d.apply(bounds.x + bounds.width, bounds.y + bounds.height),
  ];
  const left = Math.max(0, Math.min(...cs.map((c) => c.x)) - margin);
  const right = Math.min(
    d.displayWidth,
    Math.max(...cs.map((c) => c.x)) + margin,
  );
  const top = Math.min(
    d.displayHeight,
    Math.max(...cs.map((c) => c.y)) + margin,
  );
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
    const fullW = Math.round(d.displayWidth * scale);
    const fullH = Math.round(d.displayHeight * scale);
    const startX = -Math.round(left * scale);
    // CSS-style y: PDFium origin is page top-left in render coords.
    const startY = -Math.round((d.displayHeight - top) * scale);
    // 0x01 = FPDF_ANNOT, 0x10 = FPDF_REVERSE_BYTE_ORDER (gives RGBA).
    m.FPDF_RenderPageBitmap(
      bitmapPtr,
      page.pagePtr,
      startX,
      startY,
      fullW,
      fullH,
      (4 - page.display.rotate) & 3,
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
  glyphSpans: Array<{ left: number; right: number }>;
  /** A box edge sits just left / right of the glyphs (OCR may read it as "["). */
  edgeLeft: boolean;
  edgeRight: boolean;
  reversed: boolean;
}

const INK_NONE = 0;
const INK_SOFT = 1;
const INK_SOLID = 2;
const SOLID_INK_CUT = 60;
const SOFT_INK_CUT = 30;
const GROUND_SHARE = 0.65;
const HIGHLIGHT_SHARE = 0.97;
const REVERSED_GROUND_MAX = 110;
const REVERSED_CONTRAST = 60;
const DOT_GAP_SHARE = 0.2;

// Faint anti-aliased edges still show once the paper around them is covered, so the extent uses a softer cut than the colour does.
function inkLevel(l: number, paper: number): number {
  if (l < paper - SOLID_INK_CUT) return INK_SOLID;
  if (l < paper - SOFT_INK_CUT) return INK_SOFT;
  return INK_NONE;
}

// Light text on a dark fill: the ground of the glyph rows is dark, and their brightest pixels stand well clear of it.
function readGround(core: number[]): { ground: number; reversed: boolean } {
  const sorted = [...core].sort((p, q) => p - q);
  const ground = sorted[Math.floor(sorted.length * GROUND_SHARE)] ?? 255;
  const highlight = sorted[Math.floor(sorted.length * HIGHLIGHT_SHARE)] ?? 0;
  const reversed =
    ground < REVERSED_GROUND_MAX && highlight > ground + REVERSED_CONTRAST;
  return { ground, reversed };
}

interface InkGrid {
  ink: Uint8Array;
  width: number;
  height: number;
  x0: number;
  x1: number;
}

interface InkRows {
  rowInk: number[];
  rowSolid: number[];
  ruled: Uint8Array;
}

function countRows({ ink, width, height, x0, x1 }: InkGrid): InkRows {
  const span = x1 - x0 + 1;
  const rowInk = new Array<number>(height).fill(0);
  const rowSolid = new Array<number>(height).fill(0);
  const ruled = new Uint8Array(height);
  for (let y = 0; y < height; y++)
    for (let x = x0; x <= x1; x++) {
      const v = ink[y * width + x];
      if (v) rowInk[y]++;
      if (v === INK_SOLID) rowSolid[y]++;
    }
  // A row solidly inked edge to edge is a rule or box border; its blurred fringe is not, or glyphs touching it would stop short.
  for (let y = 0; y < height; y++) {
    if (span <= 12 || rowSolid[y] <= span * 0.85) continue;
    for (let k = y - 3; k <= y + 3; k++)
      if (k >= 0 && k < height && (k === y || rowInk[k] > span * 0.3))
        ruled[k] = 1;
  }
  return { rowInk, rowSolid, ruled };
}

// A column inked all the way between the rules around the text (or the whole slice) is a box edge: no glyph spans it. Clears those columns and returns them.
function stripBoxEdges(
  grid: InkGrid,
  ruled: Uint8Array,
  mid: number,
): number[] {
  const { ink, width, height, x0, x1 } = grid;
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
    for (let y = 0; y < height; y++) ink[y * width + x] = INK_NONE;
  }
  return edgeCols;
}

const pairInk = (rowInk: number[], y: number) =>
  (rowInk[y] ?? 0) + (rowInk[y - 1] ?? 0);

// Only descenders go below the baseline, so it is where the ink per row falls away most sharply; a share of the peak misses thin, light strokes.
function baselineRow(rowInk: number[], top: number, bottom: number): number {
  let baseRow = bottom + 1;
  let drop = -1;
  for (let y = Math.round(top + (bottom - top) * 0.4); y <= bottom; y++) {
    const d = pairInk(rowInk, y) - pairInk(rowInk, y + 2);
    if (d > drop) {
      drop = d;
      baseRow = y + 1;
    }
  }
  return baseRow;
}

// Lowercase text is densest below its x-height, so the x-line is where ink rises most sharply going down.
function xHeightRow(rowInk: number[], top: number, baseRow: number): number {
  let xRow = top;
  let rise = -1;
  for (let y = top + 1; y <= baseRow - (baseRow - top) * 0.3; y++) {
    const r = pairInk(rowInk, y + 1) - pairInk(rowInk, y - 1);
    if (r > rise) {
      rise = r;
      xRow = y;
    }
  }
  return xRow;
}

// A real lowercase band is several times denser than the ascenders and fills about two thirds of the height; capitals fill it all or leave only blur above.
function isLowercaseBand(
  rowInk: number[],
  top: number,
  xRow: number,
  baseRow: number,
): boolean {
  const mean = (a: number, b: number) => {
    let sum = 0;
    for (let y = a; y < b; y++) sum += rowInk[y];
    return b > a ? sum / (b - a) : 0;
  };
  const band = (baseRow - xRow) / Math.max(1, baseRow - top);
  const density = mean(xRow, baseRow) / Math.max(0.1, mean(top, xRow));
  return band > 0.5 && band < 0.75 && density > 2 && density < 15;
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
    const d = rawView(page);
    const o = d.apply(0, 0);
    const ux = d.apply(1, 0);
    const uy = d.apply(0, 1);
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
    const lumaAt = (i: number) => luma(rgba[i], rgba[i + 1], rgba[i + 2]);
    const core: number[] = [];
    for (let y = coreTop; y <= coreBottom; y += 2)
      for (let x = x0; x <= x1; x += 2) core.push(lumaAt(y * stride + x * 4));
    const { ground, reversed } = readGround(core);
    const tone = reversed ? (i: number) => 255 - lumaAt(i) : lumaAt;
    const slicePaper = () => {
      // Paper is most of the slice: sampled from a ring, a ruled line under it passed for paper and hid thin strokes.
      const sample: number[] = [];
      for (let y = 0; y < height; y += 2)
        for (let x = x0; x <= x1; x += 2)
          sample.push(lumaAt(y * stride + x * 4));
      sample.sort((p, q) => p - q);
      // Bright enough to clear the ink, not so bright that grain sets it.
      return sample[Math.floor(sample.length * 0.75)] ?? 255;
    };
    const paper = reversed ? 255 - ground : slicePaper();
    const ink = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = x0; x <= x1; x++) {
        const l = tone(y * stride + x * 4);
        ink[y * width + x] = inkLevel(l, paper);
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
    const grid: InkGrid = { ink, width, height, x0, x1 };
    let rows = countRows(grid);
    const edgeCols = stripBoxEdges(
      grid,
      rows.ruled,
      Math.round((coreTop + coreBottom) / 2),
    );
    if (edgeCols.length) rows = countRows(grid);
    const { rowInk, rowSolid, ruled } = rows;
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
    const grow = (
      from: number,
      step: number,
      limit: number,
      maxBlank = gap,
    ) => {
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
        } else if (++blank > maxBlank) break;
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
    // An i or j dot floats past `gap` at body sizes; the cover and copied pixels must take it, the measurements above must not.
    const dotGap = Math.max(gap, Math.round(boxPx * DOT_GAP_SHARE));
    const coverTop = fringe(grow(first, -1, boxPx * 0.6, dotGap), -1);

    const baseRow = baselineRow(rowInk, top, bottom);
    const xRow = xHeightRow(rowInk, top, baseRow);
    const lowercaseBand = isLowercaseBand(rowInk, top, xRow, baseRow);

    const colInk = (x: number) => {
      for (let y = top; y <= bottom; y++)
        if (ink[y * width + x] === INK_SOLID) return true;
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
    const spans: Array<[number, number]> = [];
    let runStart = -1;
    for (let x = left; x <= right + 1; x++) {
      const on = x <= right && colInk(x);
      if (on && runStart < 0) runStart = x;
      if (!on && runStart >= 0) {
        spans.push([runStart, x - 1]);
        runStart = -1;
      }
    }

    const dark: Array<[number, number, number, number]> = [];
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (ink[y * width + x] !== INK_SOLID) continue;
        const i = y * stride + x * 4;
        dark.push([tone(i), rgba[i], rgba[i + 1], rgba[i + 2]]);
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
        coverTop - clearance(coverTop, -1, (y) => ruled[y] === 1),
        bottom + clearance(bottom, 1, (y) => ruled[y] === 1),
        left - clearance(left, -1, (x) => edgeCols.includes(x)),
        right + clearance(right, 1, (x) => edgeCols.includes(x)),
      ),
      body: pageBox(solidTop, solidBottom, solidLeft, solidRight),
      baseline: pageY(baseRow),
      xLine: lowercaseBand ? pageY(xRow) : null,
      density: dark.length / ((right - left + 1) * (bottom - top + 1)),
      glyphCenters: spans.map(([l, r]) => pageX((l + r + 1) / 2)),
      glyphSpans: spans.map(([l, r]) => ({
        left: pageX(l),
        right: pageX(r + 1),
      })),
      edgeLeft: edgeCols.some(
        (c) => c < solidLeft && solidLeft - c < scale * 6,
      ),
      edgeRight: edgeCols.some(
        (c) => c > solidRight && c - solidRight < scale * 6,
      ),
      reversed,
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
    const o = rawView(page).apply(0, 0);
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

/** Luma of a page area at `scale` px per point, softened by `blur` px. */
export function renderLuma(
  m: WrappedPdfiumModule,
  page: Page,
  rect: PageRect,
  blur = 2,
  scale = INK_SCALE,
): Luma | null {
  try {
    const slice = renderSlice(m, page, rect, 0, scale);
    if (!slice) return null;
    const { rgba, width, height, stride } = slice;
    const data = new Float32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * stride + x * 4;
        data[y * width + x] = luma(rgba[i], rgba[i + 1], rgba[i + 2]);
      }
    return blurLuma({ data, width, height }, blur);
  } catch {
    return null;
  }
}

export interface Luma {
  data: Float32Array;
  width: number;
  height: number;
}

// Box blur rows then columns: scans are soft, drawn text is crisp.
export function blurLuma(img: Luma, blur: number): Luma {
  const { width, height } = img;
  return { data: boxBlur(img.data, width, height, blur), width, height };
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
