import { useEffect, useRef } from 'react';

export const DEFAULT_VISIBILITY_THRESHOLD = 70; // Require at least 70% of the page height to be visible
export const DEFAULT_FALLBACK_ZOOM = 1.44; // 144% fallback when no reliable metadata is present

export interface ZoomViewport {
  clientWidth?: number;
  clientHeight?: number;
  width?: number;
  height?: number;
}

export type AutoZoomDecision =
  | { type: 'fallback'; zoom: number }
  | { type: 'fitWidth' }
  | { type: 'adjust'; zoom: number };

export interface AutoZoomParams {
  viewportWidth: number;
  viewportHeight: number;
  fitWidthZoom: number;
  pagesPerSpread: number;
  pageRect?: { width: number; height: number } | null;
  metadataAspectRatio?: number | null;
  visibilityThreshold?: number;
  fallbackZoom?: number;
}

export function determineAutoZoom({
  viewportWidth,
  viewportHeight,
  fitWidthZoom,
  pagesPerSpread,
  pageRect,
  metadataAspectRatio,
  visibilityThreshold = DEFAULT_VISIBILITY_THRESHOLD,
  fallbackZoom = DEFAULT_FALLBACK_ZOOM,
}: AutoZoomParams): AutoZoomDecision {
  // Get aspect ratio from pageRect or metadata
  const rectWidth = pageRect?.width ?? 0;
  const rectHeight = pageRect?.height ?? 0;
  const aspectRatio: number | null =
    rectWidth > 0 ? rectHeight / rectWidth : metadataAspectRatio ?? null;

  // Need aspect ratio to proceed
  if (!aspectRatio || aspectRatio <= 0) {
    return { type: 'fallback', zoom: Math.min(fitWidthZoom, fallbackZoom) };
  }

  // Landscape pages need 100% visibility, portrait need the specified threshold
  const isLandscape = aspectRatio < 1;
  const targetVisibility = isLandscape ? 100 : visibilityThreshold;

  // Calculate zoom level that shows targetVisibility% of page height
  const pageHeightAtFitWidth = (viewportWidth / pagesPerSpread) * aspectRatio;
  const heightBasedZoom = fitWidthZoom * (viewportHeight / pageHeightAtFitWidth) / (targetVisibility / 100);

  // Use whichever zoom is smaller (more zoomed out) to satisfy both width and height constraints
  if (heightBasedZoom < fitWidthZoom) {
    // Need to zoom out from fitWidth to show enough height
    return { type: 'adjust', zoom: heightBasedZoom };
  } else {
    // fitWidth already shows enough
    return { type: 'fitWidth' };
  }
}

export interface MeasurePageRectOptions {
  selector?: string;
  maxAttempts?: number;
  shouldCancel?: () => boolean;
}

export async function measureRenderedPageRect({
  selector = '[data-page-index="0"]',
  maxAttempts = 12,
  shouldCancel,
}: MeasurePageRectOptions = {}): Promise<DOMRect | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  let rafId: number | null = null;

  const waitForNextFrame = () =>
    new Promise<void>((resolve) => {
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        resolve();
      });
    });

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (shouldCancel?.()) {
        return null;
      }

      const element = document.querySelector(selector) as HTMLElement | null;

      if (element) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return rect;
        }
      }

      await waitForNextFrame();
    }
  } finally {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }
  }

  return null;
}

export interface FitWidthResizeOptions {
  isManaged: boolean;
  requestFitWidth: () => void;
  onDebouncedResize: () => void;
  debounceMs?: number;
}

export function useFitWidthResize({
  isManaged,
  requestFitWidth,
  onDebouncedResize,
  debounceMs = 150,
}: FitWidthResizeOptions): void {
  const managedRef = useRef(isManaged);
  const requestFitWidthRef = useRef(requestFitWidth);
  const onDebouncedResizeRef = useRef(onDebouncedResize);

  useEffect(() => {
    managedRef.current = isManaged;
  }, [isManaged]);

  useEffect(() => {
    requestFitWidthRef.current = requestFitWidth;
  }, [requestFitWidth]);

  useEffect(() => {
    onDebouncedResizeRef.current = onDebouncedResize;
  }, [onDebouncedResize]);

  useEffect(() => {
    let timeoutId: number | undefined;

    const handleResize = () => {
      if (!managedRef.current) {
        return;
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        requestFitWidthRef.current?.();
        onDebouncedResizeRef.current?.();
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [debounceMs]);
}
