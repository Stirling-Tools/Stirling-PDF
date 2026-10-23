import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import type { Point, ZoomLevel } from "@embedpdf/plugin-zoom";
import { useSpread, SpreadMode } from "@embedpdf/plugin-spread/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import type { ZoomAPIWrapper } from "@editor/contexts/viewer/viewerBridges";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";
import { useAllFiles, useFileSelection } from "@editor/contexts/FileContext";
import {
  determineAutoZoom,
  DEFAULT_FALLBACK_ZOOM,
  DEFAULT_VISIBILITY_THRESHOLD,
  useFitWidthResize,
} from "@editor/utils/viewerZoom";
import { getFirstPageAspectRatioFromStub } from "@editor/utils/pageMetadata";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import {
  preferencesService,
  type ViewerZoomSetting,
} from "@editor/services/preferencesService";

function isFitMode(level: ZoomLevel): boolean {
  return level === ZoomMode.FitWidth || level === ZoomMode.FitPage;
}

/**
 * Connects the PDF zoom plugin to the shared ViewerContext.
 *
 * A fit mode requested through the context's zoom API is the user's choice and
 * stays put: the plugin re-fits it on resize, spread and rotation itself. Only
 * the fit width this bridge lands on while auto-zooming is re-evaluated by the
 * auto heuristic on resize and spread changes.
 */
export function ZoomAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();
  const lastAutoZoomedRootIdRef = useRef<string | null>(null);
  const explicitFitRef = useRef(false);

  // Don't render the inner component until we have a valid document ID and document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return (
    <ZoomAPIBridgeInner
      key={activeDocumentId}
      documentId={activeDocumentId}
      lastAutoZoomedRootIdRef={lastAutoZoomedRootIdRef}
      explicitFitRef={explicitFitRef}
    />
  );
}

function ZoomAPIBridgeInner({
  documentId,
  lastAutoZoomedRootIdRef,
  explicitFitRef,
}: {
  documentId: string;
  lastAutoZoomedRootIdRef: React.MutableRefObject<string | null>;
  explicitFitRef: React.MutableRefObject<boolean>;
}) {
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const liveZoomState = zoom?.getState() ?? zoomState;
  const { provides: spread, spreadMode } = useSpread(documentId);
  const { state: scrollState } = useScroll(documentId);
  const totalPages = scrollState?.totalPages ?? 0;
  const { registerBridge, triggerImmediateZoomUpdate } = useViewer();
  const { fileStubs } = useAllFiles();
  const { selectedFileIds } = useFileSelection();

  const activeId = selectedFileIds?.[0];
  const activeStub =
    (activeId ? fileStubs.find((s) => s.id === activeId) : undefined) ??
    fileStubs[0];
  const activeFileRootId = activeStub?.originalFileId || activeStub?.id;

  const hasSetInitialZoom = useRef(
    !!activeFileRootId && activeFileRootId === lastAutoZoomedRootIdRef.current,
  );
  const lastSpreadMode = useRef(spreadMode ?? SpreadMode.None);
  const lastAppliedZoom = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  const [autoZoomTick, setAutoZoomTick] = useState(0);

  const spreadRef = useRef(spread);
  useEffect(() => {
    spreadRef.current = spread;
  }, [spread]);

  // Keep zoom ref updated; the capability identity can change and
  // requestFitWidth plus bridge registration read through this ref.
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [spreadReadyTick, setSpreadReadyTick] = useState(0);

  const checkSpreadReady = useCallback(() => {
    if (!spreadRef.current) {
      return false;
    }
    try {
      const pages = spreadRef.current.getSpreadPages();
      return Array.isArray(pages) && pages.length > 0;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (checkSpreadReady()) return;
    const interval = setInterval(() => {
      if (checkSpreadReady()) {
        setSpreadReadyTick((t) => t + 1);
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [checkSpreadReady, documentId, totalPages]);

  const scheduleAutoZoom = useCallback(() => {
    hasSetInitialZoom.current = false;
    lastAppliedZoom.current = null;
    setAutoZoomTick((tick) => tick + 1);
  }, []);

  const rescheduleAutoZoom = useCallback(() => {
    if (explicitFitRef.current) return;
    scheduleAutoZoom();
  }, [explicitFitRef, scheduleAutoZoom]);

  const requestFitWidth = useCallback(() => {
    if (zoomRef.current && checkSpreadReady()) {
      try {
        zoomRef.current.requestZoom(ZoomMode.FitWidth, { vx: 0.5, vy: 0 });
      } catch (error) {
        console.warn("[ZoomAPIBridge] Failed to request fit width:", error);
      }
    }
  }, [checkSpreadReady]);

  // Extract primitive values from liveZoomState for dependency arrays
  const zoomLevel = liveZoomState?.zoomLevel;
  const currentZoomLevel = liveZoomState?.currentZoomLevel;

  // Extract metadata aspect ratio as a primitive to avoid object reference issues
  const metadataAspectRatio = getFirstPageAspectRatioFromStub(activeStub);

  useEffect(() => {
    if (!activeFileRootId) {
      hasSetInitialZoom.current = false;
      lastAutoZoomedRootIdRef.current = null;
      lastAppliedZoom.current = null;
      explicitFitRef.current = false;
      return;
    }

    // Only reset zoom when opening a genuinely different document, not on version increments
    if (activeFileRootId !== lastAutoZoomedRootIdRef.current) {
      lastAutoZoomedRootIdRef.current = activeFileRootId;
      explicitFitRef.current = false;
      scheduleAutoZoom();
    }
  }, [activeFileRootId, explicitFitRef, scheduleAutoZoom]);

  useEffect(() => {
    const currentSpreadMode = spreadMode ?? SpreadMode.None;
    if (currentSpreadMode !== lastSpreadMode.current) {
      lastSpreadMode.current = currentSpreadMode;

      if (zoomLevel === ZoomMode.FitWidth || zoomLevel === ZoomMode.Automatic) {
        requestFitWidth();
        rescheduleAutoZoom();
      }
    }
  }, [spreadMode, zoomLevel, rescheduleAutoZoom, requestFitWidth]);

  const isManagedZoom =
    checkSpreadReady() &&
    !!zoom &&
    (zoomLevel === ZoomMode.FitWidth || zoomLevel === ZoomMode.Automatic);

  useFitWidthResize({
    isManaged: isManagedZoom,
    requestFitWidth,
    onDebouncedResize: rescheduleAutoZoom,
  });

  useEffect(() => {
    if (!zoom || zoomLevel === undefined || currentZoomLevel === undefined) {
      return;
    }

    if (!activeFileRootId || !checkSpreadReady()) {
      return;
    }

    if (hasSetInitialZoom.current || explicitFitRef.current) {
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

    const applyTrackedZoom = (
      level: number | ZoomMode,
      effectiveZoom: number,
    ) => {
      try {
        zoom.requestZoom(level, { vx: 0.5, vy: 0 });
      } catch (error) {
        console.warn("[ZoomAPIBridge] Failed to request zoom:", error);
      }
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

      // Check user preference for default viewer zoom
      const zoomPref: ViewerZoomSetting =
        preferencesService.getPreference("defaultViewerZoom");
      if (zoomPref !== "auto") {
        if (zoomPref === "fitWidth") {
          applyTrackedZoom(ZoomMode.FitWidth, fitWidthZoom);
        } else if (zoomPref === "fitPage") {
          applyTrackedZoom(ZoomMode.FitPage, fitWidthZoom);
        } else {
          // Numeric zoom: '50', '75', '100', '125', '150', '200'
          const numericZoom = parseInt(zoomPref, 10) / 100;
          applyTrackedZoom(numericZoom, numericZoom);
        }
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

      if (decision.type === "fallback") {
        applyTrackedZoom(decision.zoom, decision.zoom);
        return;
      }

      if (decision.type === "fitWidth") {
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
    activeFileRootId,
    checkSpreadReady,
    spreadReadyTick,
    metadataAspectRatio,
    requestFitWidth,
    autoZoomTick,
    spreadMode,
    triggerImmediateZoomUpdate,
    explicitFitRef,
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

    zoomSubscriptionRef.current = zoom.onZoomChange(
      (event: { newZoom?: number; level?: ZoomLevel }) => {
        // Wheel, pinch and marquee zoom reach the plugin directly, so a numeric
        // level, not the context API, is what ends an explicit fit.
        if (typeof event?.level === "number") {
          explicitFitRef.current = false;
        }
        if (typeof event?.newZoom !== "number") {
          return;
        }
        lastAppliedZoom.current = event.newZoom;
        triggerImmediateZoomUpdate(Math.round(event.newZoom * 100));
      },
    );

    return () => {
      if (zoomSubscriptionRef.current) {
        zoomSubscriptionRef.current();
        zoomSubscriptionRef.current = null;
      }
    };
  }, [zoom, triggerImmediateZoomUpdate, explicitFitRef]);

  const contextZoomApi = useMemo<ZoomAPIWrapper>(
    () => ({
      zoomIn: () => zoomRef.current?.zoomIn(),
      zoomOut: () => zoomRef.current?.zoomOut(),
      toggleMarqueeZoom: () => zoomRef.current?.toggleMarqueeZoom(),
      requestZoom: (level: ZoomLevel, center?: Point) => {
        // Set from the requested mode, not just the fit ones: Automatic hands
        // the fit back to the auto heuristic, so it has to clear the flag.
        explicitFitRef.current = isFitMode(level);
        zoomRef.current?.requestZoom(level, center);
      },
    }),
    [explicitFitRef],
  );

  // Extract primitive values to avoid dependency on object reference
  const zoomStateCurrentZoomLevel = liveZoomState?.currentZoomLevel;

  // Register bridge - only re-run when actual values change
  useLayoutEffect(() => {
    const currentZoom = zoomRef.current;
    if (!currentZoom || zoomStateCurrentZoomLevel === undefined) {
      return;
    }

    const currentZoomLevel =
      zoomStateCurrentZoomLevel ?? lastAppliedZoom.current ?? 1;

    const newState = {
      currentZoom: currentZoomLevel,
      zoomPercent: Math.round(currentZoomLevel * 100),
      level: zoomLevel,
    };

    // Registered before notifying, so a listener that reads getZoomState()
    // sees the level this notification is about.
    registerBridge("zoom", {
      state: newState,
      api: contextZoomApi,
    });

    triggerImmediateZoomUpdate(newState.zoomPercent);
  }, [
    zoomStateCurrentZoomLevel,
    zoomLevel,
    registerBridge,
    triggerImmediateZoomUpdate,
    contextZoomApi,
  ]);

  return null;
}
