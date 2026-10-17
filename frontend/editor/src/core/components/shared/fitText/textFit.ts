import { RefObject, useEffect } from "react";

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
  options: AdjustFontSizeOptions = {},
): () => void {
  if (!element) return () => {};

  const computed = window.getComputedStyle(element);
  const baseFontPx =
    options.maxFontSizePx ?? parseFloat(computed.fontSize || "16");
  const minScale = Math.max(0.1, options.minFontScale ?? 0.7);
  const stepScale = Math.max(0.005, options.stepScale ?? 0.05);
  const singleLine = options.singleLine ?? false;
  const maxLines = options.maxLines;

  // Ensure measurement is consistent
  if (singleLine) {
    element.style.whiteSpace = "nowrap";
  }
  // Never split within words; only allow natural breaks (spaces) or explicit soft breaks
  element.style.wordBreak = "keep-all";
  element.style.overflowWrap = "normal";
  // Disable automatic hyphenation to avoid mid-word breaks; use only manual opportunities
  element.style.setProperty("hyphens", "manual");
  element.style.overflow = "visible";

  const minFontPx = baseFontPx * minScale;
  const stepPx = Math.max(0.5, baseFontPx * stepScale);

  const fits = (maxHeight: number): boolean =>
    element.scrollWidth <= element.clientWidth + 1 && // tolerance
    element.scrollHeight <= maxHeight + 1;

  /** Height the label may take; infinite when only its width is limited. */
  const heightLimit = (): number => {
    if (typeof maxLines !== "number" || maxLines <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    const lineHeight =
      parseFloat(window.getComputedStyle(element).lineHeight) ||
      baseFontPx * 1.2;
    return lineHeight * maxLines + 0.1; // small epsilon
  };

  /** The room a refit depends on, and the text it has to fit into it. */
  const inputs = (): string =>
    `${element.parentElement?.clientWidth ?? element.clientWidth}\u0000${element.textContent ?? ""}`;

  let settled = "";

  const fit = () => {
    const current = inputs();
    // Writing the font size resizes the label itself, which the parent observer used to read back as a reason to.
    if (current === settled) return;
    settled = current;

    // Start from the largest size: a box that grew should get its text back.
    element.style.fontSize = `${baseFontPx}px`;
    const maxHeight = heightLimit();

    let size = baseFontPx;
    let iterations = 0;
    // Guard against excessive loops
    while (!fits(maxHeight) && size > minFontPx && iterations < 200) {
      size = Math.max(minFontPx, size - stepPx);
      element.style.fontSize = `${size}px`;
      iterations += 1;
    }
  };

  let pending = 0;
  const schedule = () => {
    // A mutation storm or a resize drag arrives as many callbacks; one fit per
    // frame is all they can act on, and the rest collapse into it.
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      fit();
    });
  };

  // Defer to next frame to ensure layout is ready
  const raf = requestAnimationFrame(fit);

  const ro = new ResizeObserver(schedule);
  // The label's own box is what the fit changes; watching the parent is what
  // tells it when it has different room to fit into.
  if (element.parentElement) ro.observe(element.parentElement);

  const mo = new MutationObserver(schedule);
  mo.observe(element, { characterData: true, childList: true, subtree: true });

  return () => {
    cancelAnimationFrame(raf);
    if (pending) cancelAnimationFrame(pending);
    try {
      ro.disconnect();
    } catch {
      /* Ignore errors */
    }
    try {
      mo.disconnect();
    } catch {
      /* Ignore errors */
    }
  };
}

/** React hook wrapper for convenience */
export function useAdjustFontSizeToFit(
  ref: RefObject<HTMLElement | null>,
  options: AdjustFontSizeOptions = {},
) {
  useEffect(() => {
    if (!ref.current) return;
    const cleanup = adjustFontSizeToFit(ref.current, options);
    return cleanup;
  }, [
    ref,
    options.maxFontSizePx,
    options.minFontScale,
    options.stepScale,
    options.maxLines,
    options.singleLine,
  ]);
}
