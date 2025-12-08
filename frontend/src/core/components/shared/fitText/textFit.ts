import { RefObject, useEffect } from 'react';

export type AdjustFontSizeOptions = {
  /** Max font size to start from. Defaults to the element's computed font size. */
  maxFontSizePx?: number;
  /** Minimum scale relative to max size (like React Native's minimumFontScale). Default 0.7 */
  minFontScale?: number;
  /** Step as a fraction of max size used while shrinking. Default 0.05 (5%). */
  stepScale?: number;
  /** Limit the number of lines to fit. If omitted, only width is considered for multi-line. */
  maxLines?: number;
  /** If true, force single-line fitting (uses nowrap). Default false. */
  singleLine?: boolean;
};

/**
 * Imperative util: progressively reduces font-size until content fits within the element
 * (width and optional line count). Returns a cleanup that disconnects observers.
 */
export function adjustFontSizeToFit(
  element: HTMLElement,
  options: AdjustFontSizeOptions = {}
): () => void {
  if (!element) return () => {};

  const computed = window.getComputedStyle(element);
  const baseFontPx = options.maxFontSizePx ?? parseFloat(computed.fontSize || '16');
  const minScale = Math.max(0.1, options.minFontScale ?? 0.7);
  const stepScale = Math.max(0.005, options.stepScale ?? 0.05);
  const singleLine = options.singleLine ?? false;
  const maxLines = options.maxLines;

  // Ensure measurement is consistent
  if (singleLine) {
    element.style.whiteSpace = 'nowrap';
  }
  // Never split within words; only allow natural breaks (spaces) or explicit soft breaks
  element.style.wordBreak = 'keep-all';
  element.style.overflowWrap = 'normal';
  // Disable automatic hyphenation to avoid mid-word breaks; use only manual opportunities
  element.style.setProperty('hyphens', 'manual');
  element.style.overflow = 'visible';

  const minFontPx = baseFontPx * minScale;
  const stepPx = Math.max(0.5, baseFontPx * stepScale);

  const fit = () => {
    // Reset to largest before measuring
    element.style.fontSize = `${baseFontPx}px`;

    // Calculate target height threshold for line limit
    let maxHeight = Number.POSITIVE_INFINITY;
    if (typeof maxLines === 'number' && maxLines > 0) {
      const cs = window.getComputedStyle(element);
      const lineHeight = parseFloat(cs.lineHeight) || baseFontPx * 1.2;
      maxHeight = lineHeight * maxLines + 0.1; // small epsilon
    }

    let current = baseFontPx;
    // Guard against excessive loops
    let iterations = 0;
    while (iterations < 200) {
      const fitsWidth = element.scrollWidth <= element.clientWidth + 1; // tolerance
      const fitsHeight = element.scrollHeight <= maxHeight + 1;
      const fits = fitsWidth && fitsHeight;
      if (fits || current <= minFontPx) break;
      current = Math.max(minFontPx, current - stepPx);
      element.style.fontSize = `${current}px`;
      iterations += 1;
    }
  };

  // Defer to next frame to ensure layout is ready
  const raf = requestAnimationFrame(fit);

  const ro = new ResizeObserver(() => fit());
  ro.observe(element);
  if (element.parentElement) ro.observe(element.parentElement);

  const mo = new MutationObserver(() => fit());
  mo.observe(element, { characterData: true, childList: true, subtree: true });

  return () => {
    cancelAnimationFrame(raf);
    try { ro.disconnect(); } catch { /* Ignore errors */ }
    try { mo.disconnect(); } catch { /* Ignore errors */ }
  };
}

/** React hook wrapper for convenience */
export function useAdjustFontSizeToFit(
  ref: RefObject<HTMLElement | null>,
  options: AdjustFontSizeOptions = {}
) {
  useEffect(() => {
    if (!ref.current) return;
    const cleanup = adjustFontSizeToFit(ref.current, options);
    return cleanup;
  }, [ref, options.maxFontSizePx, options.minFontScale, options.stepScale, options.maxLines, options.singleLine]);
}


