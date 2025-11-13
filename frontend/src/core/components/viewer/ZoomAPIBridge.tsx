import { useCallback, useEffect, useRef, useState } from 'react';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useFileState } from '@app/contexts/FileContext';
import {
  determineAutoZoom,
  DEFAULT_FALLBACK_ZOOM,
  DEFAULT_VISIBILITY_THRESHOLD,
  measureRenderedPageRect,
  useFitWidthResize,
  ZoomViewport,
} from '@app/utils/viewerZoom';
import { getFirstPageAspectRatioFromStub } from '@app/utils/pageMetadata';

export function ZoomAPIBridge() {
  const { provides: zoom, state: zoomState } = useZoom();
  const { spreadMode } = useSpread();
  const { registerBridge, triggerImmediateZoomUpdate } = useViewer();
  const { selectors } = useFileState();

  const hasSetInitialZoom = useRef(false);
  const lastSpreadMode = useRef(spreadMode ?? SpreadMode.None);
  const lastFileId = useRef<string | undefined>(undefined);
  const lastAppliedZoom = useRef<number | null>(null);
  const [autoZoomTick, setAutoZoomTick] = useState(0);

  const scheduleAutoZoom = useCallback(() => {
    hasSetInitialZoom.current = false;
    lastAppliedZoom.current = null;
    setAutoZoomTick((tick) => tick + 1);
  }, []);

  const requestFitWidth = useCallback(() => {
    if (zoom) {
      zoom.requestZoom(ZoomMode.FitWidth, { vx: 0.5, vy: 0 });
    }
  }, [zoom]);

  const stubs = selectors.getStirlingFileStubs();
  const firstFileStub = stubs[0];
  const firstFileId = firstFileStub?.id;

  useEffect(() => {
    if (!firstFileId) {
      hasSetInitialZoom.current = false;
      lastFileId.current = undefined;
      lastAppliedZoom.current = null;
      return;
    }

    if (firstFileId !== lastFileId.current) {
      lastFileId.current = firstFileId;
      scheduleAutoZoom();
    }
  }, [firstFileId, scheduleAutoZoom]);

  useEffect(() => {
    const currentSpreadMode = spreadMode ?? SpreadMode.None;
    if (currentSpreadMode !== lastSpreadMode.current) {
      lastSpreadMode.current = currentSpreadMode;

      const hadTrackedAutoZoom = lastAppliedZoom.current !== null;
      const zoomLevel = zoomState?.zoomLevel;
      if (
        zoomLevel === ZoomMode.FitWidth ||
        zoomLevel === ZoomMode.Automatic ||
        hadTrackedAutoZoom
      ) {
        requestFitWidth();
        scheduleAutoZoom();
      }
    }
  }, [spreadMode, zoomState?.zoomLevel, scheduleAutoZoom, requestFitWidth]);

  const getViewportSnapshot = useCallback((): ZoomViewport | null => {
    if (!zoomState || typeof zoomState !== 'object') {
      return null;
    }

    if ('viewport' in zoomState) {
      const candidate = (zoomState as { viewport?: ZoomViewport | null }).viewport;
      return candidate ?? null;
    }

    return null;
  }, [zoomState]);

  const isManagedZoom =
    !!zoom &&
    (zoomState?.zoomLevel === ZoomMode.FitWidth ||
      zoomState?.zoomLevel === ZoomMode.Automatic ||
      lastAppliedZoom.current !== null);

  useFitWidthResize({
    isManaged: isManagedZoom,
    requestFitWidth,
    onDebouncedResize: scheduleAutoZoom,
  });

  useEffect(() => {
    if (!zoom || !zoomState) {
      return;
    }

    if (!firstFileId) {
      return;
    }

    if (hasSetInitialZoom.current) {
      return;
    }

    if (zoomState.zoomLevel !== ZoomMode.FitWidth) {
      if (zoomState.zoomLevel === ZoomMode.Automatic) {
        requestFitWidth();
      }
      return;
    }

    const fitWidthZoom = zoomState.currentZoomLevel;
    if (!fitWidthZoom || fitWidthZoom <= 0) {
      return;
    }

    const applyTrackedZoom = (level: number | ZoomMode, effectiveZoom: number) => {
      zoom.requestZoom(level, { vx: 0.5, vy: 0 });
      lastAppliedZoom.current = effectiveZoom;
      triggerImmediateZoomUpdate(Math.round(effectiveZoom * 100));
      hasSetInitialZoom.current = true;
    };

    let cancelled = false;

    const applyAutoZoom = async () => {
      const currentSpreadMode = spreadMode ?? SpreadMode.None;
      const pagesPerSpread = currentSpreadMode !== SpreadMode.None ? 2 : 1;
      const metadataAspectRatio = getFirstPageAspectRatioFromStub(firstFileStub);

      const viewport = getViewportSnapshot();

      if (cancelled) {
        return;
      }

      const metrics = viewport ?? {};
      const viewportWidth =
        metrics.clientWidth ?? metrics.width ?? window.innerWidth ?? 0;
      const viewportHeight =
        metrics.clientHeight ?? metrics.height ?? window.innerHeight ?? 0;

      if (viewportWidth <= 0 || viewportHeight <= 0) {
        return;
      }

      const pageRect = await measureRenderedPageRect({
        shouldCancel: () => cancelled,
      });
      if (cancelled) {
        return;
      }

      const decision = determineAutoZoom({
        viewportWidth,
        viewportHeight,
        fitWidthZoom,
        pagesPerSpread,
        pageRect: pageRect
          ? { width: pageRect.width, height: pageRect.height }
          : undefined,
        metadataAspectRatio: metadataAspectRatio ?? null,
        visibilityThreshold: DEFAULT_VISIBILITY_THRESHOLD,
        fallbackZoom: DEFAULT_FALLBACK_ZOOM,
      });

      if (decision.type === 'fallback') {
        applyTrackedZoom(decision.zoom, decision.zoom);
        return;
      }

      if (decision.type === 'fitWidth') {
        applyTrackedZoom(ZoomMode.FitWidth, fitWidthZoom);
        return;
      }

      applyTrackedZoom(decision.zoom, decision.zoom);
    };

    applyAutoZoom();

    return () => {
      cancelled = true;
    };
  }, [
    zoom,
    zoomState,
    firstFileId,
    firstFileStub,
    requestFitWidth,
    getViewportSnapshot,
    autoZoomTick,
    spreadMode,
    triggerImmediateZoomUpdate,
  ]);

  useEffect(() => {
    if (!zoom) {
      return;
    }

    const unsubscribe = zoom.onZoomChange((event: { newZoom?: number }) => {
      if (typeof event?.newZoom !== 'number') {
        return;
      }
      lastAppliedZoom.current = event.newZoom;
      triggerImmediateZoomUpdate(Math.round(event.newZoom * 100));
    });

    return () => {
      unsubscribe();
    };
  }, [zoom, triggerImmediateZoomUpdate]);

  useEffect(() => {
    if (!zoom || !zoomState) {
      return;
    }

    const currentZoomLevel =
      lastAppliedZoom.current ?? zoomState.currentZoomLevel ?? 1;

    const newState = {
      currentZoom: currentZoomLevel,
      zoomPercent: Math.round(currentZoomLevel * 100),
    };

    triggerImmediateZoomUpdate(newState.zoomPercent);

    registerBridge('zoom', {
      state: newState,
      api: zoom,
    });
  }, [zoom, zoomState, registerBridge, triggerImmediateZoomUpdate]);

  return null;
}



