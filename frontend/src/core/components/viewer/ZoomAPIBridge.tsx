import { useCallback, useEffect, useRef, useState } from 'react';
import { useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';
import { useFileState } from '@app/contexts/FileContext';
import {
  determineAutoZoom,
  DEFAULT_FALLBACK_ZOOM,
  DEFAULT_VISIBILITY_THRESHOLD,
  useFitWidthResize,
} from '@app/utils/viewerZoom';
import { getFirstPageAspectRatioFromStub } from '@app/utils/pageMetadata';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF zoom plugin to the shared ViewerContext.
 */
export function ZoomAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Don't render the inner component until we have a valid document ID and document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return <ZoomAPIBridgeInner documentId={activeDocumentId} />;
}

function ZoomAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const { spreadMode } = useSpread(documentId);
  const { registerBridge, triggerImmediateZoomUpdate } = useViewer();
  const { selectors } = useFileState();

  const hasSetInitialZoom = useRef(false);
  const lastSpreadMode = useRef(spreadMode ?? SpreadMode.None);
  const lastFileId = useRef<string | undefined>(undefined);
  const lastAppliedZoom = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  const [autoZoomTick, setAutoZoomTick] = useState(0);

  // Keep zoom ref updated
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const scheduleAutoZoom = useCallback(() => {
    hasSetInitialZoom.current = false;
    lastAppliedZoom.current = null;
    setAutoZoomTick((tick) => tick + 1);
  }, []);

  const requestFitWidth = useCallback(() => {
    if (zoomRef.current) {
      zoomRef.current.requestZoom(ZoomMode.FitWidth, { vx: 0.5, vy: 0 });
    }
  }, []);

  const stubs = selectors.getStirlingFileStubs();
  const firstFileStub = stubs[0];
  const firstFileId = firstFileStub?.id;

  // Extract primitive values from zoomState for dependency arrays
  const zoomLevel = zoomState?.zoomLevel;
  const currentZoomLevel = zoomState?.currentZoomLevel;

  // Extract metadata aspect ratio as a primitive to avoid object reference issues
  const metadataAspectRatio = getFirstPageAspectRatioFromStub(firstFileStub);

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
      if (
        zoomLevel === ZoomMode.FitWidth ||
        zoomLevel === ZoomMode.Automatic ||
        hadTrackedAutoZoom
      ) {
        requestFitWidth();
        scheduleAutoZoom();
      }
    }
  }, [spreadMode, zoomLevel, scheduleAutoZoom, requestFitWidth]);


  const isManagedZoom =
    !!zoom &&
    (zoomLevel === ZoomMode.FitWidth ||
      zoomLevel === ZoomMode.Automatic ||
      lastAppliedZoom.current !== null);

  useFitWidthResize({
    isManaged: isManagedZoom,
    requestFitWidth,
    onDebouncedResize: scheduleAutoZoom,
  });

  useEffect(() => {
    if (!zoom || zoomLevel === undefined || currentZoomLevel === undefined) {
      return;
    }

    if (!firstFileId) {
      return;
    }

    if (hasSetInitialZoom.current) {
      return;
    }

    if (zoomLevel !== ZoomMode.FitWidth) {
      if (zoomLevel === ZoomMode.Automatic) {
        requestFitWidth();
      }
      return;
    }

    const fitWidthZoom = currentZoomLevel;
    if (!fitWidthZoom || fitWidthZoom <= 0 || fitWidthZoom === 1) {
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

      if (cancelled) {
        return;
      }

      const viewportWidth = window.innerWidth ?? 0;
      const viewportHeight = window.innerHeight ?? 0;

      if (viewportWidth <= 0 || viewportHeight <= 0) {
        return;
      }

      const decision = determineAutoZoom({
        viewportWidth,
        viewportHeight,
        fitWidthZoom,
        pagesPerSpread,
        pageRect: undefined,
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
    zoomLevel,
    currentZoomLevel,
    firstFileId,
    metadataAspectRatio,
    requestFitWidth,
    autoZoomTick,
    spreadMode,
    triggerImmediateZoomUpdate,
  ]);

  // Subscribe to zoom changes - use ref to avoid re-subscribing when zoom reference changes
  const zoomSubscriptionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Cleanup previous subscription if any
    if (zoomSubscriptionRef.current) {
      zoomSubscriptionRef.current();
      zoomSubscriptionRef.current = null;
    }

    if (!zoom) {
      return;
    }

    zoomSubscriptionRef.current = zoom.onZoomChange((event: { newZoom?: number }) => {
      if (typeof event?.newZoom !== 'number') {
        return;
      }
      lastAppliedZoom.current = event.newZoom;
      triggerImmediateZoomUpdate(Math.round(event.newZoom * 100));
    });

    return () => {
      if (zoomSubscriptionRef.current) {
        zoomSubscriptionRef.current();
        zoomSubscriptionRef.current = null;
      }
    };
  }, [zoom, triggerImmediateZoomUpdate]);

  // Extract primitive values to avoid dependency on object reference
  const zoomStateCurrentZoomLevel = zoomState?.currentZoomLevel;

  // Register bridge - only re-run when actual values change
  useEffect(() => {
    const currentZoom = zoomRef.current;
    if (!currentZoom || zoomStateCurrentZoomLevel === undefined) {
      return;
    }

    const currentZoomLevel =
      lastAppliedZoom.current ?? zoomStateCurrentZoomLevel ?? 1;

    const newState = {
      currentZoom: currentZoomLevel,
      zoomPercent: Math.round(currentZoomLevel * 100),
    };

    triggerImmediateZoomUpdate(newState.zoomPercent);

    registerBridge('zoom', {
      state: newState,
      api: currentZoom,
    });
  }, [zoomStateCurrentZoomLevel, registerBridge, triggerImmediateZoomUpdate]);

  return null;
}
