/**
 * Read the page's own background colour straight from the rendered bitmap.
 *
 * The editing mask used to pick between near-white and near-black from the
 * TEXT colour alone, so a run on a coloured page got a grey band across it.
 * It was also translucent, which let the original glyphs ghost through the
 * replacement. Sampling the canvas gives the real colour to paint, opaquely.
 */

/** Strip height either side of the glyph band that is sampled for background. */
const MARGIN_RATIO = 0.22;
/** Pixels stepped over while sampling; keeps the read cheap on wide runs. */
const STEP = 3;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `rgb(r, g, b)` - always fully opaque, so nothing underneath shows through. */
export function toOpaqueCss(c: Rgb): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/**
 * Most common colour in the strips directly above and below the run's glyphs.
 * Returns null when the canvas cannot be read (tainted, zero-sized, no 2d).
 */
export function sampleRunBackground(
  canvas: HTMLCanvasElement,
  rectInCanvasPx: { x: number; y: number; width: number; height: number },
): Rgb | null {
  const { x, y, width, height } = rectInCanvasPx;
  if (width < 1 || height < 1) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const margin = Math.max(1, Math.round(height * MARGIN_RATIO));
  const bands = [
    { top: Math.round(y), h: margin },
    { top: Math.round(y + height - margin), h: margin },
  ];

  const buckets = new Map<
    string,
    { r: number; g: number; b: number; n: number }
  >();
  for (const band of bands) {
    const top = Math.max(0, Math.min(canvas.height - 1, band.top));
    const h = Math.max(1, Math.min(band.h, canvas.height - top));
    const left = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const w = Math.max(1, Math.min(Math.round(width), canvas.width - left));
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(left, top, w, h).data;
    } catch {
      return null;
    }
    for (let i = 0; i < data.length; i += 4 * STEP) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = `${r & 0xf8},${g & 0xf8},${b & 0xf8}`;
      const hit = buckets.get(key);
      if (hit) {
        hit.r += r;
        hit.g += g;
        hit.b += b;
        hit.n += 1;
      } else buckets.set(key, { r, g, b, n: 1 });
    }
  }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const v of buckets.values()) if (!best || v.n > best.n) best = v;
  if (!best) return null;
  return {
    r: Math.round(best.r / best.n),
    g: Math.round(best.g / best.n),
    b: Math.round(best.b / best.n),
  };
}
