import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { PageRect, RGBA } from "@app/tools/pdfTextEditor/types";
import { renderLuma } from "@app/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  emitFillRect,
  emitTextLine,
  measureObjSpanPt,
  removeAndDestroyObject,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import { transformObject } from "@app/tools/pdfTextEditor/util/objectTransform";

// Picking and placing a face that passes for scanned text.

// Base-14 metrics (AFM, per 1000 em) for the faces we can draw in.
export const FACES = [
  { family: "Helvetica", bold: "Helvetica-Bold", cap: 718, asc: 718, xh: 523 },
  { family: "Times-Roman", bold: "Times-Bold", cap: 662, asc: 683, xh: 450 },
  { family: "Courier", bold: "Courier-Bold", cap: 562, asc: 629, xh: 426 },
];
export const [HELVETICA, TIMES, COURIER] = FACES;
export type Face = (typeof FACES)[number];

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };

/** How tall the tallest glyph of `text` is, as a share of the em. */
export function topShare(face: Face, text: string): number {
  if (/[A-Z0-9]/.test(text))
    return Math.max(face.cap, /[bdfhklt]/.test(text) ? face.asc : 0) / 1000;
  if (/[bdfhklt]/.test(text)) return face.asc / 1000;
  return face.xh / 1000;
}

export const median = (xs: number[]) => {
  const v = [...xs].sort((p, q) => p - q);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

export const clampStretch = (s: number) =>
  Math.min(1.35, Math.max(0.7, s || 1));

/** Width of `text` set in `family` at `size`, measured on the page. */
export function spanOf(
  doc: EditorDocument,
  page: Page,
  text: string,
  family: string,
  size: number,
): number {
  const ptrs = emitTextLine({
    doc,
    page,
    text,
    x: 0,
    y: 0,
    fontSize: size,
    fill: BLACK,
    originalFontPtr: 0,
    fallbackFamily: family,
  });
  const span = measureObjSpanPt(doc.module, ptrs);
  for (const p of ptrs) removeAndDestroyObject(doc.module, page.pagePtr, p);
  return span ? span.right - span.left : 0;
}

// The face whose letter widths explain these OCR word widths best. A single
// scale absorbs size; what is left is the face's shape, which is what tells a
// typewriter face from a proportional one. Null when the words cannot tell.
export function fitFace(
  doc: EditorDocument,
  page: Page,
  words: Array<{ text: string; width: number }>,
): Face | null {
  const usable = words
    .map((w) => ({ text: w.text.trim(), width: w.width }))
    .filter((w) => w.text.length >= 2 && w.width > 0)
    .slice(0, 16);
  if (usable.length < 3) return null;
  const err = (face: Face) => {
    const ratios = usable.map(
      (w) =>
        w.width / Math.max(1e-3, spanOf(doc, page, w.text, face.family, 100)),
    );
    const k = median(ratios);
    return median(ratios.map((r) => Math.abs(r / k - 1)));
  };
  const [sans, serif, mono] = FACES.map(err);
  // Three words line up with any face by chance often enough; ask for four.
  if (usable.length >= 4 && mono < Math.min(sans, serif) * 0.7) return COURIER;
  // Serif and sans widths differ little, so a few words cannot settle it.
  if (usable.length < 5) return null;
  return serif < sans * 0.7 ? TIMES : HELVETICA;
}

// Typewriter text: every glyph sits on the same pitch, so each gap between
// glyph centres is a whole number of steps (two when low-res glyphs touch).
// Digits share one width in most proportional faces too, so they prove nothing.
export function isEvenlySpaced(centers: number[], text: string): boolean {
  const chars = text.replace(/\s/g, "");
  if (centers.length < 8 || /^\d+$/.test(chars)) return false;
  if (centers.length > chars.length * 1.1 + 1) return false;
  const steps = centers.slice(1).map((c, i) => c - centers[i]);
  const pitch = (centers[centers.length - 1] - centers[0]) / (chars.length - 1);
  const onGrid = steps.filter((st) => {
    const n = Math.max(1, Math.round(st / pitch));
    return Math.abs(st / pitch - n) / n < 0.15;
  });
  return onGrid.length >= steps.length * 0.85;
}

export interface Placement {
  text: string;
  x: number;
  baseline: number;
  family: string;
  size: number;
  stretch: number;
  /** Where the drawn ink should start, raw page x. */
  inkLeft: number;
  fill: RGBA;
  /** Outline in the fill colour that thickens the strokes, in points. */
  weight?: number;
}

/**
 * Give text that never strokes (fill-only or invisible) an opaque stroke
 * colour. "No outline" is otherwise a transparent stroke, which needs an
 * ExtGState; PDFium caches that state's name while pruning it from the page
 * resources once unused, so objects re-created later point at a missing one.
 */
export function opaqueStroke(
  m: EditorDocument["module"],
  ptrs: number[],
): void {
  for (const p of ptrs) {
    try {
      m.FPDFPageObj_SetStrokeColor(p, 0, 0, 0, 255);
    } catch {
      /* best-effort */
    }
  }
}

// Emit text squeezed or widened to the scan's letter widths, its ink starting
// where the scanned ink started whatever the face's side bearing.
export function placeText(
  doc: EditorDocument,
  page: Page,
  p: Placement,
): number[] {
  const m = doc.module;
  const ptrs = emitTextLine({
    doc,
    page,
    text: p.text,
    x: p.x,
    y: p.baseline,
    fontSize: p.size,
    fill: p.fill,
    originalFontPtr: 0,
    fallbackFamily: p.family,
    // Fill and stroke (Tr 2): blur makes scanned strokes heavier than any bold.
    ...(p.weight
      ? { renderMode: 2, stroke: p.fill, strokeWidth: p.weight }
      : {}),
  });
  if (!p.weight) opaqueStroke(m, ptrs);
  for (const ptr of ptrs)
    transformObject(m, ptr, p.stretch, 0, 0, 1, p.x * (1 - p.stretch), 0);
  const drawn = measureObjSpanPt(m, ptrs);
  const shift = drawn ? p.inkLeft - drawn.left : 0;
  if (Math.abs(shift) < p.size * 0.5)
    for (const ptr of ptrs) transformObject(m, ptr, 1, 0, 0, 1, shift, 0);
  return ptrs;
}

// Pearson correlation of two same-sized luma images.
function correlation(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    ab += da * db;
    aa += da * da;
    bb += db * db;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

// Average stroke thickness: ink pixels per horizontal run of ink, cut halfway
// between paper and ink. Unlike total darkness, paper grain and the grey core
// of a blurred stroke barely move it.
function strokeWidth(
  img: { data: Float32Array; width: number; height: number },
  cut: number,
): number {
  let inked = 0;
  let runs = 0;
  for (let y = 0; y < img.height; y++) {
    let inRun = false;
    for (let x = 0; x < img.width; x++) {
      const on = img.data[y * img.width + x] < cut;
      if (on) inked++;
      if (on && !inRun) runs++;
      inRun = on;
    }
  }
  return runs ? inked / runs : 0;
}

function percentile(values: Float32Array, p: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.floor((sorted.length - 1) * p)];
}

export interface ScanMatch {
  /** How alike the shapes are (correlation, up to 1). */
  score: number;
  /** Drawn stroke width over scanned: above 1 is heavier than the scan. */
  weight: number;
}

/** How much `c` drawn on the spot looks like the scanned pixels there. */
export function matchScan(
  doc: EditorDocument,
  page: Page,
  ink: { rect: PageRect; body: PageRect },
  c: Omit<Placement, "inkLeft" | "fill">,
  /** Blur for the drawn copy; the scan is compared unblurred when set. */
  softness?: number,
): ScanMatch {
  const m = doc.module;
  const probe = {
    x: ink.rect.x - 1,
    y: ink.rect.y - 1,
    width: ink.rect.width + 2,
    height: ink.rect.height + 2,
  };
  const none = { score: 0, weight: 1 };
  const scan = renderLuma(m, page, probe, softness === undefined ? 2 : 0);
  if (!scan) return none;
  const cover = emitFillRect(m, page, probe, { r: 255, g: 255, b: 255 }, 1);
  const ptrs = placeText(doc, page, { ...c, inkLeft: ink.body.x, fill: BLACK });
  const drawn = renderLuma(m, page, probe, softness ?? 2);
  for (const p of [cover, ...ptrs]) removeAndDestroyObject(m, page.pagePtr, p);
  if (!drawn || drawn.data.length !== scan.data.length) return none;
  // Each image cut halfway between its own paper and its own darkest ink.
  const mid = (img: { data: Float32Array }) =>
    (percentile(img.data, 0.85) + percentile(img.data, 0.01)) / 2;
  return {
    score: correlation(scan.data, drawn.data),
    weight:
      strokeWidth(drawn, mid(drawn)) /
      Math.max(0.5, strokeWidth(scan, mid(scan))),
  };
}

// How many pixels an ink edge takes to go from paper to ink: the contrast
// over the steepest gradients. Blur widens it; noise and colour do not.
function edgeWidth(img: { data: Float32Array; width: number; height: number }) {
  const { data, width, height } = img;
  const contrast = percentile(data, 0.95) - percentile(data, 0.02);
  if (contrast < 20) return 0;
  const grads: number[] = [];
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      const g = Math.max(
        Math.abs(data[i + 1] - data[i]),
        Math.abs(data[i + width] - data[i]),
      );
      if (g > contrast * 0.05) grads.push(g);
    }
  if (grads.length === 0) return 0;
  grads.sort((p, q) => p - q);
  return contrast / grads[Math.floor(grads.length * 0.9)];
}

/**
 * How soft the scan's strokes are, as a blur radius in render pixels: the blur
 * that gives `c`, drawn crisp, the scan's own edge width.
 */
export function softnessOf(
  doc: EditorDocument,
  page: Page,
  ink: { rect: PageRect; body: PageRect },
  c: Omit<Placement, "inkLeft" | "fill">,
): number {
  const m = doc.module;
  const probe = {
    x: ink.rect.x - 1,
    y: ink.rect.y - 1,
    width: ink.rect.width + 2,
    height: ink.rect.height + 2,
  };
  const scan = renderLuma(m, page, probe, 0);
  if (!scan) return 0;
  const target = edgeWidth(scan);
  const cover = emitFillRect(m, page, probe, { r: 255, g: 255, b: 255 }, 1);
  const ptrs = placeText(doc, page, { ...c, inkLeft: ink.body.x, fill: BLACK });
  let best = { r: 0, err: Infinity };
  for (const r of [0, 1, 2]) {
    const drawn = renderLuma(m, page, probe, r);
    if (!drawn) continue;
    // Ties go to the sharper: crisp text should stay crisp.
    const err = Math.abs(edgeWidth(drawn) - target) + r * 0.05;
    if (err < best.err) best = { r, err };
  }
  for (const p of [cover, ...ptrs]) removeAndDestroyObject(m, page.pagePtr, p);
  return best.r;
}

/** Box-blur an RGBA image in place, `r` pixels each way. */
export function blurRgba(
  img: { rgba: Uint8Array; width: number; height: number },
  r: number,
): void {
  const { rgba, width, height } = img;
  const tmp = new Uint8Array(rgba.length);
  const pass = (src: Uint8Array, dst: Uint8Array, dx: number, dy: number) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let n = 0;
          for (let k = -r; k <= r; k++) {
            const xx = x + k * dx;
            const yy = y + k * dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            sum += src[(yy * width + xx) * 4 + c];
            n++;
          }
          const i = (y * width + x) * 4;
          dst[i + c] = sum / n;
          dst[i + 3] = 255;
        }
  };
  pass(rgba, tmp, 1, 0);
  pass(tmp, rgba, 0, 1);
}

/**
 * Make a copied patch ink-only: paper turns transparent and part-inked pixels
 * keep their ink at partial opacity, so a moved word does not paint a paper
 * rectangle over whatever it lands on.
 */
export function toInkOnly(
  img: { rgba: Uint8Array; width: number; height: number },
  paper: RGBA,
): void {
  const { rgba } = img;
  const lum = (i: number) =>
    0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  const paperL = 0.299 * paper.r + 0.587 * paper.g + 0.114 * paper.b;
  let darkest = paperL;
  for (let i = 0; i < rgba.length; i += 4) darkest = Math.min(darkest, lum(i));
  const span = Math.max(60, paperL - darkest);
  const bg = [paper.r, paper.g, paper.b];
  for (let i = 0; i < rgba.length; i += 4) {
    const a = Math.min(1, Math.max(0, (paperL - lum(i)) / span));
    if (a < 0.04) {
      rgba[i + 3] = 0;
      continue;
    }
    // Undo the blend with the paper so the edge keeps the ink's own colour.
    for (let c = 0; c < 3; c++)
      rgba[i + c] = Math.min(
        255,
        Math.max(0, (rgba[i + c] - (1 - a) * bg[c]) / a),
      );
    rgba[i + 3] = Math.round(a * 255);
  }
}
