export interface FontMetrics {
  ascent: number;
  descent: number;
}

let sharedCanvas: HTMLCanvasElement | null = null;
const metricsCache = new Map<string, FontMetrics>();
// canvas measureText is the single most-called browser API on the typing path
// (refit + advance prediction re-measure the same tokens every keystroke), so
// widths are memoized per (font, text).
const advanceCache = new Map<string, number>();
const ADVANCE_CACHE_LIMIT = 4096;

export function cssFontShorthand(
  fontStyle: string,
  fontWeight: number,
  fontSizePx: number,
  fontFamily: string,
): string {
  return `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
}

function context(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!sharedCanvas) sharedCanvas = document.createElement("canvas");
  return sharedCanvas.getContext("2d");
}

export function measureAdvancePx(text: string, font: string): number {
  if (text === "") return 0;
  const key = `${font}\u0000${text}`;
  const cached = advanceCache.get(key);
  if (cached !== undefined) return cached;
  const ctx = context();
  if (!ctx) return 0;
  ctx.font = font;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const width = ctx.measureText(text).width;
  // Bounded: a long editing session must not grow this without limit.
  if (advanceCache.size >= ADVANCE_CACHE_LIMIT) {
    const oldest = advanceCache.keys().next().value;
    if (oldest !== undefined) advanceCache.delete(oldest);
  }
  advanceCache.set(key, width);
  return width;
}

export function measureMaxLineWidth(text: string, font: string): number {
  let max = 0;
  for (const line of text.split(/\r?\n/)) {
    const w = measureAdvancePx(line, font);
    if (w > max) max = w;
  }
  return max;
}

/**
 * Width of the widest run of non-space characters - the narrowest a box can be
 * and still show every glyph. No line breaking can beat it: there is nowhere
 * inside a word to break, so a box narrower than this clips text whatever the
 * wrap target says.
 */
export function measureLongestTokenWidth(text: string, font: string): number {
  let max = 0;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const w = measureAdvancePx(token, font);
    if (w > max) max = w;
  }
  return max;
}

export function measureFontMetrics(
  font: string,
  fontSizePx: number,
): FontMetrics {
  const cached = metricsCache.get(font);
  if (cached) return cached;
  const fallback = { ascent: 0.8 * fontSizePx, descent: 0.2 * fontSizePx };
  const ctx = context();
  if (!ctx) return fallback;
  ctx.font = font;
  const m = ctx.measureText("Hg");
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  if (typeof ascent !== "number" || typeof descent !== "number") {
    return fallback;
  }
  const metrics = { ascent, descent };
  metricsCache.set(font, metrics);
  return metrics;
}

export function resetTextMetricsCache(): void {
  metricsCache.clear();
  advanceCache.clear();
}
