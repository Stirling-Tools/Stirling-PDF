import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import type { PageRect, RGBA } from "@app/tools/pdfTextEditor/v2/types";

/**
 * Render the area of the page surrounding a text run and pick the
 * dominant background color. Used by EditTextCommand to choose a cover-
 * rectangle fill that matches the page's actual background instead of
 * hardcoding white.
 *
 * Strategy:
 *   1. Render a small bitmap covering the run's bounds plus a margin.
 *   2. Sample pixels along the inflated border (top/bottom/left/right
 *      rings) - those rings are almost always background, while the
 *      interior contains the text glyphs we want to mask.
 *   3. Quantize each ring pixel to a 4-bit-per-channel bucket and pick
 *      the most common bucket. Its mean colour becomes the fill.
 *
 * Falls back to `{255,255,255,255}` (white) if the sample fails or
 * returns no usable colour.
 */
const MARGIN_POINTS = 6;
const SAMPLE_SCALE = 1.5; // bitmap resolution (px per PDF point)

export interface SampleResult {
  fill: RGBA;
  /** True when the sampler found at least one consensus background pixel. */
  confident: boolean;
}

export function sampleBackground(
  m: WrappedPdfiumModule,
  page: Page,
  bounds: PageRect,
): SampleResult {
  const fallback: RGBA = { r: 255, g: 255, b: 255, a: 255 };
  try {
    const left = Math.max(0, bounds.x - MARGIN_POINTS);
    const right = Math.min(page.width, bounds.x + bounds.width + MARGIN_POINTS);
    const top = Math.min(page.height, bounds.y + bounds.height + MARGIN_POINTS);
    const bottom = Math.max(0, bounds.y - MARGIN_POINTS);
    const widthPts = right - left;
    const heightPts = top - bottom;
    if (widthPts <= 1 || heightPts <= 1)
      return { fill: fallback, confident: false };

    const w = Math.max(8, Math.round(widthPts * SAMPLE_SCALE));
    const h = Math.max(8, Math.round(heightPts * SAMPLE_SCALE));

    // Render the slice via PDFium. We render the full page bitmap and
    // shift it so the desired area sits at (0,0). Cheap because we
    // bound by the run's local size.
    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    if (!bitmapPtr) return { fill: fallback, confident: false };
    try {
      m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);
      // PDFium renders the WHOLE page sized to (pageW*scale, pageH*scale)
      // at the bitmap's origin. We translate so our slice lands at 0,0.
      const fullW = Math.round(page.width * SAMPLE_SCALE);
      const fullH = Math.round(page.height * SAMPLE_SCALE);
      const startX = -Math.round(left * SAMPLE_SCALE);
      // CSS-style y: PDFium origin is page top-left in render coords.
      const startY = -Math.round((page.height - top) * SAMPLE_SCALE);
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
        (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory })
          .memory.buffer,
        bufferPtr,
        stride * h,
      );

      // Sample the border rings (top, bottom, left, right) plus the
      // four corners. Bucket by 4 bits per channel.
      const buckets = new Map<
        number,
        { r: number; g: number; b: number; count: number }
      >();
      const samples: Array<[number, number]> = [];
      const ringWidth = 2;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const inTop = y < ringWidth;
          const inBottom = y >= h - ringWidth;
          const inLeft = x < ringWidth;
          const inRight = x >= w - ringWidth;
          if (!(inTop || inBottom || inLeft || inRight)) continue;
          samples.push([x, y]);
        }
      }
      for (const [x, y] of samples) {
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
      let best: { r: number; g: number; b: number; count: number } | null =
        null;
      for (const b of buckets.values()) {
        if (!best || b.count > best.count) best = b;
      }
      if (!best || best.count === 0)
        return { fill: fallback, confident: false };
      return {
        fill: {
          r: Math.round(best.r / best.count),
          g: Math.round(best.g / best.count),
          b: Math.round(best.b / best.count),
          a: 255,
        },
        confident: true,
      };
    } finally {
      m.FPDFBitmap_Destroy(bitmapPtr);
    }
  } catch {
    return { fill: fallback, confident: false };
  }
}
