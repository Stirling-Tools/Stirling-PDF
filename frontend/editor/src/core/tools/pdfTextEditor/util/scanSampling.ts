import type {
  PageRect,
  RGBA,
  TableSnapshot,
} from "@app/tools/pdfTextEditor/types";

/** What a scan actually looks like inside one cell. */
export interface CellColors {
  /** The cell's background - paper, or its shading if it has any. */
  bg: RGBA;
  /** The colour its text is printed in. */
  ink: RGBA;
}

/** Colours read off a scan, in the same row/col shape as the table. */
export interface ScanColors {
  /** Per cell, or null where there was nothing readable to sample. */
  cells: (CellColors | null)[][];
  /** The table's dominant background, used behind the whole grid. */
  paper: RGBA;
  /** Darkest well-represented ink, used for the rebuilt rules. */
  rule: RGBA;
}

/** Inset so a cell's own borders and its neighbours stay out of the sample. */
const CELL_INSET = 0.12;
// Colour buckets: wide enough that scan noise lands in one bin, narrow enough
// to keep a light grey header apart from the paper it sits on. At 16 those two
// shared a bucket, and the paper came out grey.
const BUCKET = 8;
/** A cell smaller than this many device pixels has nothing worth sampling. */
const MIN_PX = 3;
// A bucket under this share of the cell is noise, not its ink. Kept low: a
// short entry in a wide cell covers very little of it, and at 2% "11.4%" on a
// shaded row was discarded and a stray light bucket taken as its ink.
const INK_MIN_SHARE = 0.004;
/** Luma a candidate must clear, on the far side of the background. */
const INK_MIN_CONTRAST = 30;
/** Depth of the strip outside the table that stands in for the page's paper. */
const PAPER_STRIP_PT = 10;

const bucketOf = (c: RGBA): number =>
  ((c.r / BUCKET) | 0) * 65536 +
  ((c.g / BUCKET) | 0) * 256 +
  ((c.b / BUCKET) | 0);

/** Bucket tally holding the mean of what landed in it, not the first sample. */
interface Bucket {
  n: number;
  r: number;
  g: number;
  b: number;
}

function add(into: Map<number, Bucket>, c: RGBA): void {
  const k = bucketOf(c);
  const hit = into.get(k);
  if (hit) {
    hit.n++;
    hit.r += c.r;
    hit.g += c.g;
    hit.b += c.b;
  } else {
    into.set(k, { n: 1, r: c.r, g: c.g, b: c.b });
  }
}

const meanOf = (b: Bucket): RGBA => ({
  r: Math.round(b.r / b.n),
  g: Math.round(b.g / b.n),
  b: Math.round(b.b / b.n),
  a: 255,
});

function dominant(counts: Map<number, Bucket>): RGBA | null {
  let best: Bucket | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  return best ? meanOf(best) : null;
}

const luma = (c: RGBA): number => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;

const distance = (a: RGBA, b: RGBA): number =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

// The page canvas the viewer already painted. Sampling that rather than the
// image object gets the colours after every transform the page applies, and
// costs nothing extra to produce.
export function pageCanvas(pageIndex: number): HTMLCanvasElement | null {
  const el = document.querySelector(`canvas[data-page-canvas="${pageIndex}"]`);
  return el instanceof HTMLCanvasElement && el.width > 0 && el.height > 0
    ? el
    : null;
}

// Reads the scan's own colours for a table: what each cell is filled with and
// what its text is printed in. A rebuild uses these instead of flat white and
// black, which is what left a rebuilt table sitting in a pale patch on a
// tinted scan - and would have erased white-on-dark header text entirely.
export function sampleTableColors(
  canvas: HTMLCanvasElement,
  table: TableSnapshot,
  pageWidthPt: number,
  pageHeightPt: number,
): ScanColors | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || pageWidthPt <= 0 || pageHeightPt <= 0) return null;
  const sx = canvas.width / pageWidthPt;
  const sy = canvas.height / pageHeightPt;
  const read = (rect: PageRect): Map<number, Bucket> | null =>
    readRegion(ctx, rect, sx, sy, pageHeightPt);

  // The paper comes from just OUTSIDE the table. Taking it from the cells lets
  // a big shaded header pass itself off as the background, and then every
  // ordinary row reads as the shaded one.
  const b = table.bounds;
  const strips: PageRect[] = [
    { x: b.x, y: b.y + b.height, width: b.width, height: PAPER_STRIP_PT },
    { x: b.x, y: b.y - PAPER_STRIP_PT, width: b.width, height: PAPER_STRIP_PT },
    {
      x: b.x - PAPER_STRIP_PT,
      y: b.y,
      width: PAPER_STRIP_PT,
      height: b.height,
    },
    { x: b.x + b.width, y: b.y, width: PAPER_STRIP_PT, height: b.height },
  ];
  const margin = new Map<number, Bucket>();
  for (const strip of strips) {
    const got = read(strip);
    if (got) for (const [k, v] of got) merge(margin, k, v);
  }

  const cells: (CellColors | null)[][] = [];
  const inside = new Map<number, Bucket>();
  for (let r = 0; r < table.rows; r++) {
    const row: (CellColors | null)[] = [];
    for (let c = 0; c < table.cols; c++) {
      const rect = cellRect(table, r, c);
      const counts = read(inset(rect));
      if (counts) for (const [k, v] of counts) merge(inside, k, v);
      row.push(counts ? colorsOf(counts) : null);
    }
    cells.push(row);
  }

  const paper = dominant(margin) ??
    dominant(inside) ?? { r: 255, g: 255, b: 255, a: 255 };
  let rule: RGBA = { r: 0, g: 0, b: 0, a: 255 };
  let darkest = Infinity;
  for (const entry of inside.values()) {
    // The rule colour has to be genuinely present, not one stray dark pixel.
    const c = meanOf(entry);
    if (entry.n > 8 && luma(c) < darkest) {
      darkest = luma(c);
      rule = c;
    }
  }
  return { cells, paper, rule };
}

/** One cell in page space, before any inset. */
function cellRect(table: TableSnapshot, row: number, col: number): PageRect {
  return {
    x: table.colEdges[col],
    y: table.rowEdges[row + 1],
    width: table.colEdges[col + 1] - table.colEdges[col],
    height: table.rowEdges[row] - table.rowEdges[row + 1],
  };
}

/** Pull the sample away from a cell's own borders and its neighbours. */
function inset(rect: PageRect): PageRect {
  const dx = rect.width * CELL_INSET;
  const dy = rect.height * CELL_INSET;
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width - dx * 2,
    height: rect.height - dy * 2,
  };
}

function merge(into: Map<number, Bucket>, key: number, from: Bucket): void {
  const hit = into.get(key);
  if (hit) {
    hit.n += from.n;
    hit.r += from.r;
    hit.g += from.g;
    hit.b += from.b;
  } else {
    into.set(key, { ...from });
  }
}

// One region's colours, bucketed. Returns null when the region falls outside
// the canvas or is too small to say anything about.
function readRegion(
  ctx: CanvasRenderingContext2D,
  rect: PageRect,
  sx: number,
  sy: number,
  pageHeightPt: number,
): Map<number, Bucket> | null {
  const left = Math.round(rect.x * sx);
  const width = Math.round(rect.width * sx);
  // PDF y counts up from the bottom; the canvas counts down from the top.
  const top = Math.round((pageHeightPt - (rect.y + rect.height)) * sy);
  const height = Math.round(rect.height * sy);
  if (width < MIN_PX || height < MIN_PX) return null;
  if (left < 0 || top < 0) return null;
  if (left + width > ctx.canvas.width || top + height > ctx.canvas.height) {
    return null;
  }
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(left, top, width, height).data;
  } catch {
    return null;
  }
  const counts = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    add(counts, { r: data[i], g: data[i + 1], b: data[i + 2], a: 255 });
  }
  return counts;
}

// A cell's background and ink. The background is the most common colour - text
// is always a minority of the pixels, which is what a mean over the whole cell
// would smear away. The ink is the best-represented colour furthest from that
// background, so it works the same on black-on-white and white-on-navy.
function colorsOf(counts: Map<number, Bucket>): CellColors | null {
  const bg = dominant(counts);
  if (!bg) return null;
  let total = 0;
  for (const entry of counts.values()) total += entry.n;
  const light = luma(bg) > 128;
  let ink: RGBA | null = null;
  let far = 0;
  for (const entry of counts.values()) {
    if (entry.n / total < INK_MIN_SHARE) continue;
    const c = meanOf(entry);
    // Ink on a pale cell is DARKER, ink on a dark cell is lighter. Without
    // that direction the paper showing through a shaded cell scores as its
    // ink, and the entry is painted in a colour close to its background.
    const contrast = light ? luma(bg) - luma(c) : luma(c) - luma(bg);
    if (contrast < INK_MIN_CONTRAST) continue;
    const d = distance(c, bg);
    if (d > far) {
      far = d;
      ink = c;
    }
  }
  // An empty cell has no ink to find; a readable contrast against the
  // background is what separates real text from paper grain.
  return { bg, ink: ink ?? contrastTo(bg) };
}

/** Fallback ink when a cell holds no text to sample: whatever reads on it. */
function contrastTo(bg: RGBA): RGBA {
  return luma(bg) > 128
    ? { r: 0, g: 0, b: 0, a: 255 }
    : { r: 255, g: 255, b: 255, a: 255 };
}
