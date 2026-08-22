export interface FontMetrics {
  ascent: number;
  descent: number;
}

let sharedCanvas: HTMLCanvasElement | null = null;
const metricsCache = new Map<string, FontMetrics>();

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
  const ctx = context();
  if (!ctx) return 0;
  ctx.font = font;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return ctx.measureText(text).width;
}

export function measureMaxLineWidth(text: string, font: string): number {
  let max = 0;
  for (const line of text.split(/\r?\n/)) {
    const w = measureAdvancePx(line, font);
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
}
