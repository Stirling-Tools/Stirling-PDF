import type { TokenBoundingBox, WordHighlightEntry } from '@app/types/compare';
import type { FileId } from '@app/types/file';
import type { StirlingFile, StirlingFileStub } from '@app/types/fileContext';
import type { PagePreview } from '@app/types/compare';

/** Convert hex color (#rrggbb) to rgba() string with alpha; falls back to input if invalid. */
export const toRgba = (hexColor: string, alpha: number): string => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return hexColor;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Normalize rotation to [0, 360). */
export const normalizeRotation = (deg: number | undefined | null): number => {
  const n = ((deg ?? 0) % 360 + 360) % 360;
  return n;
};

/**
 * Merge overlapping or touching rectangles into larger non-overlapping blocks.
 * Robust across rotations (vertical groups) and prevents dark spots from overlaps.
 */
export const mergeConnectedRects = (rects: TokenBoundingBox[]): TokenBoundingBox[] => {
  if (rects.length === 0) return rects;
  const EPS = 0.004; // small tolerance in normalized page coords
  const sorted = rects
    .slice()
    .sort((a, b) => (a.top !== b.top ? a.top - b.top : a.left - b.left));
  const merged: TokenBoundingBox[] = [];

  const overlapsOrTouches = (a: TokenBoundingBox, b: TokenBoundingBox) => {
    const aR = a.left + a.width;
    const aB = a.top + a.height;
    const bR = b.left + b.width;
    const bB = b.top + b.height;
    return !(b.left > aR + EPS || bR < a.left - EPS || b.top > aB + EPS || bB < a.top - EPS);
  };

  for (const r of sorted) {
    let mergedIntoExisting = false;
    for (let i = 0; i < merged.length; i += 1) {
      const m = merged[i];
      if (overlapsOrTouches(m, r)) {
        const left = Math.min(m.left, r.left);
        const top = Math.min(m.top, r.top);
        const right = Math.max(m.left + m.width, r.left + r.width);
        const bottom = Math.max(m.top + m.height, r.top + r.height);
        merged[i] = {
          left,
          top,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
        };
        mergedIntoExisting = true;
        break;
      }
    }
    if (!mergedIntoExisting) merged.push({ ...r });
  }
  return merged;
};

/** Group word rectangles by change id using metaIndexToGroupId. */
export const groupWordRects = (
  wordRects: WordHighlightEntry[],
  metaIndexToGroupId: Map<number, string>,
  pane: 'base' | 'comparison'
): Map<string, TokenBoundingBox[]> => {
  const groupedRects = new Map<string, TokenBoundingBox[]>();
  for (const { rect, metaIndex } of wordRects) {
    const id = metaIndexToGroupId.get(metaIndex) ?? `${pane}-token-${metaIndex}`;
    const current = groupedRects.get(id) ?? [];
    current.push(rect);
    groupedRects.set(id, current);
  }
  return groupedRects;
};

/** Compute derived layout metrics for a page render, given environment and zoom. */
export const computePageLayoutMetrics = (args: {
  page: PagePreview;
  peerPage?: PagePreview | null;
  layout: 'side-by-side' | 'stacked';
  isMobileViewport: boolean;
  scrollRefWidth: number | null;
  viewportWidth: number;
  zoom: number;
  offsetPixels: number; // highlight offset in px relative to original page height
}) => {
  const { page, peerPage, layout, isMobileViewport, scrollRefWidth, viewportWidth, zoom, offsetPixels } = args;
  const targetHeight = peerPage ? Math.max(page.height, peerPage.height) : page.height;
  const fit = targetHeight / page.height;
  const highlightOffset = offsetPixels / page.height;
  const rotationNorm = normalizeRotation(page.rotation);
  const isPortrait = rotationNorm === 0 || rotationNorm === 180;
  const isStackedPortrait = layout === 'stacked' && isPortrait;

  const containerW = scrollRefWidth ?? viewportWidth;
  const stackedWidth = isMobileViewport
    ? Math.max(320, Math.round(containerW))
    : Math.max(320, Math.round(viewportWidth * 0.5));
  const stackedHeight = Math.round(stackedWidth * 1.4142);

  const baseWidth = isStackedPortrait ? stackedWidth : Math.round(page.width * fit);
  const baseHeight = isStackedPortrait ? stackedHeight : Math.round(targetHeight);
  const containerMaxW = scrollRefWidth ?? viewportWidth;

  // Container-first zooming with a stable baseline:
  // Treat zoom=1 as "fit to available width" for the page's base size so
  // the initial render is fully visible and centered (no cropping), regardless
  // of rotation or pane/container width. When zoom < 1, shrink the container;
  // when zoom > 1, keep the container at fit width and scale inner content.
  const MIN_CONTAINER_WIDTH = 120;
  const minScaleByWidth = MIN_CONTAINER_WIDTH / Math.max(1, baseWidth);
  const fitScaleByContainer = containerMaxW / Math.max(1, baseWidth);
  // Effective baseline scale used at zoom=1 (ensures at least the min width)
  const baselineContainerScale = Math.max(minScaleByWidth, fitScaleByContainer);
  // Lower bound the zoom so interactions remain stable
  const desiredZoom = Math.max(0.1, zoom);

  let containerScale: number;
  let innerScale: number;
  if (desiredZoom >= 1) {
    // At or above baseline: keep container at fit width and scale inner content
    containerScale = baselineContainerScale;
    innerScale = +Math.max(0.1, desiredZoom).toFixed(4);
  } else {
    // Below baseline: shrink container proportionally, do not upscale inner
    const scaled = baselineContainerScale * desiredZoom;
    // Never smaller than minimum readable width
    containerScale = Math.max(minScaleByWidth, scaled);
    innerScale = 1;
  }

  const containerWidth = Math.max(
    MIN_CONTAINER_WIDTH,
    Math.min(containerMaxW, Math.round(baseWidth * containerScale))
  );
  const containerHeight = Math.round(baseHeight * (containerWidth / Math.max(1, baseWidth)));

  return {
    targetHeight,
    fit,
    highlightOffset,
    rotationNorm,
    isPortrait,
    isStackedPortrait,
    baseWidth,
    baseHeight,
    containerMaxW,
    containerWidth,
    containerHeight,
    innerScale,
  };
};

/** Map changes to dropdown options tuple. */
export const mapChangesForDropdown = (
  changes: Array<{ value: string; label: string; pageNumber: number }>
) => changes.map(({ value, label, pageNumber }) => ({ value, label, pageNumber }));

/** File selection helpers */
export const getFileFromSelection = (
  explicit: StirlingFile | null | undefined,
  fileId: FileId | null,
  selectors: { getFile: (id: FileId) => StirlingFile | undefined | null }
): StirlingFile | null => {
  if (explicit) return explicit;
  if (!fileId) return null;
  return (selectors.getFile(fileId) as StirlingFile | undefined | null) ?? null;
};

export const getStubFromSelection = (
  fileId: FileId | null,
  selectors: { getStirlingFileStub: (id: FileId) => StirlingFileStub | undefined }
): StirlingFileStub | null => {
  if (!fileId) return null;
  const stub = selectors.getStirlingFileStub(fileId);
  return stub ?? null;
};

/** Progress banner computations */
export const computeShowProgressBanner = (
  totalsKnown: boolean,
  baseTotal: number | null | undefined,
  compTotal: number | null | undefined,
  baseLoading: boolean,
  compLoading: boolean,
  threshold: number = 400
): boolean => {
  if (!totalsKnown) return false;
  const totals = [baseTotal ?? 0, compTotal ?? 0];
  return Math.max(...totals) >= threshold && (baseLoading || compLoading);
};

export const computeProgressPct = (
  totalsKnown: boolean,
  baseTotal: number | null | undefined,
  compTotal: number | null | undefined,
  baseRendered: number,
  compRendered: number
): number => {
  const totalCombined = totalsKnown ? ((baseTotal ?? 0) + (compTotal ?? 0)) : 0;
  const renderedCombined = baseRendered + compRendered;
  return totalsKnown && totalCombined > 0
    ? Math.min(100, Math.round((renderedCombined / totalCombined) * 100))
    : 0;
};

export const computeCountsText = (
  baseRendered: number,
  baseTotal: number | null | undefined,
  baseLength: number,
  compRendered: number,
  compTotal: number | null | undefined,
  compLength: number
): string => {
  const baseTotalShown = baseTotal || baseLength;
  const compTotalShown = compTotal || compLength;
  return `${baseRendered}/${baseTotalShown} • ${compRendered}/${compTotalShown}`;
};

export const computeMaxSharedPages = (
  baseTotal: number | null | undefined,
  compTotal: number | null | undefined,
  baseLen: number,
  compLen: number
): number => {
  const baseMax = baseTotal || baseLen || 0;
  const compMax = compTotal || compLen || 0;
  const minKnown = Math.min(baseMax || Infinity, compMax || Infinity);
  if (!Number.isFinite(minKnown)) return 0;
  return Math.max(0, minKnown);
};


