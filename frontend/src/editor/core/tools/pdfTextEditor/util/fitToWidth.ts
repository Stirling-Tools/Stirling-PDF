export const MIN_RENDER_SCALE = 0.25;
export const MAX_RENDER_SCALE = 4;

export function fitToWidthScale(
  stageWidth: number,
  pageWidth: number,
  paddingPx: number,
): number {
  const raw = (stageWidth - paddingPx) / Math.max(1, pageWidth);
  return clampRenderScale(raw);
}

export function clampRenderScale(scale: number): number {
  return +Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale)).toFixed(
    2,
  );
}
