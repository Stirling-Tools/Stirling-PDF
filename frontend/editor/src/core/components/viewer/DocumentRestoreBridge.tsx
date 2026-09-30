import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Rotation } from "@embedpdf/models";
import type { ZoomDocumentState, ZoomLevel } from "@embedpdf/plugin-zoom";
import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import type { SpreadMode } from "@embedpdf/plugin-spread/react";
import { useSpreadCapability } from "@embedpdf/plugin-spread/react";
import { useRotateCapability } from "@embedpdf/plugin-rotate/react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import {
  useViewportCapability,
  useViewportPlugin,
} from "@embedpdf/plugin-viewport/react";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";

/** View state captured from the outgoing document, addressed to its replacement. */
export interface DocumentRestoreRequest {
  documentId: string;
  zoom: ZoomLevel | null;
  spread: SpreadMode | null;
  rotation: number | null;
}

/** What the bridge reports while a restore is in flight: a carried value
 *  that landed (or was given up), the scroll plugin laying the document out
 *  (ready: its own offset reset just ran and the page count is final) or
 *  reflowing it, and a scroll the viewport will apply on its next frame. */
export type DocumentRestoreEvent =
  | { type: "zoom" }
  | { type: "spread" }
  | { type: "rotation" }
  | { type: "layout-ready"; totalPages: number }
  | { type: "layout-change" }
  | { type: "scroll-request"; top: number };

type CarriedKind = "zoom" | "spread" | "rotation";

interface DocumentRestoreBridgeProps {
  request: DocumentRestoreRequest | null;
  /** Keeps the layout and scroll events flowing while a position restore is in flight. */
  restorePending: boolean;
  onEvent?: (event: DocumentRestoreEvent) => void;
}

// A plugin that keeps answering a request with something other than the
// carried value (a clamp, the reader zooming during the swap) is left alone
// after this many answers rather than fought for it. A request the plugin
// drops without answering does not count.
const MAX_REFUSALS = 5;

const zoomMatches = (state: ZoomDocumentState, target: ZoomLevel) =>
  typeof target === "number"
    ? typeof state.zoomLevel === "number" &&
      Math.abs(state.currentZoomLevel - target) < 0.001
    : state.zoomLevel === target;

/**
 * Carries the viewer's zoom, spread and rotation onto a replacement document.
 *
 * Nothing here runs on a clock. Each value is requested once the replacement
 * is active, confirmed in the commit that renders the plugin's own change,
 * and requested again only when a later plugin event shows the request was
 * dropped or overridden: the zoom plugin silently ignores a request made
 * before the viewport has a size or the pages a layout, and its own fit pass
 * can land after a request. The scroll plugin's layout events and the
 * viewport's scroll requests are forwarded so the viewer re-lands the reading
 * position on the same commits and frames.
 */
export function DocumentRestoreBridge({
  request,
  restorePending,
  onEvent,
}: DocumentRestoreBridgeProps) {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();
  const addressed = request !== null && request.documentId === activeDocumentId;

  if (!activeDocumentId || !documentReady) return null;
  if (!restorePending && !addressed) return null;

  return (
    <DocumentRestoreBridgeInner
      key={activeDocumentId}
      documentId={activeDocumentId}
      request={addressed ? request : null}
      onEvent={onEvent}
    />
  );
}

function DocumentRestoreBridgeInner({
  documentId,
  request,
  onEvent,
}: {
  documentId: string;
  request: DocumentRestoreRequest | null;
  onEvent?: (event: DocumentRestoreEvent) => void;
}) {
  // Capabilities are stable; a per-document scope is a fresh object per call,
  // so scopes are derived inside the effects rather than held as deps.
  const { provides: zoom } = useZoomCapability();
  const { provides: spread } = useSpreadCapability();
  const { provides: rotate } = useRotateCapability();
  const { provides: scroll } = useScrollCapability();
  const { provides: viewport } = useViewportCapability();
  const { plugin: viewportPlugin } = useViewportPlugin();
  // Bumped by every plugin event that can change the outcome; the reconcile
  // below re-runs on it in the same commit.
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((value) => value + 1), []);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const landedRef = useRef<Record<CarriedKind, boolean>>({
    zoom: false,
    spread: false,
    rotation: false,
  });
  const requestedRef = useRef<Record<CarriedKind, boolean>>({
    zoom: false,
    spread: false,
    rotation: false,
  });
  const refusalsRef = useRef<Record<CarriedKind, number>>({
    zoom: 0,
    spread: 0,
    rotation: 0,
  });
  // A replacement opens at the default mode with a placeholder scale; the
  // plugin only fits it once its viewport is measured. A carried mode is
  // confirmed by a zoom pass the plugin actually ran, not by the mode alone.
  const zoomPassSeenRef = useRef(false);
  // Nothing is requested before the replacement's pages are laid out: the
  // bridges that publish viewer state mount alongside this one, and a value
  // changed underneath their first registration reaches the toolbar out of
  // order. The ready pass is also the earliest point a request can land.
  const layoutReadyRef = useRef(false);

  // Subscribed in a layout effect, before the first reconcile, so a change the
  // reconcile causes is observed and rendered before paint.
  useLayoutEffect(() => {
    const forDocument = (event: { documentId: string }) =>
      event.documentId === documentId;
    const emit = (event: DocumentRestoreEvent) => onEventRef.current?.(event);
    // A change after a request is the plugin's answer to it, matching or not.
    const answered = (kind: CarriedKind) => () => {
      if (requestedRef.current[kind]) {
        requestedRef.current[kind] = false;
        refusalsRef.current[kind] += 1;
      }
      bump();
    };
    const unsubscribes = [
      zoom?.forDocument(documentId).onStateChange(answered("zoom")),
      zoom?.forDocument(documentId).onZoomChange(() => {
        zoomPassSeenRef.current = true;
        bump();
      }),
      spread?.forDocument(documentId).onSpreadChange(answered("spread")),
      rotate?.forDocument(documentId).onRotateChange(answered("rotation")),
      scroll?.onLayoutReady((event) => {
        if (!forDocument(event)) return;
        layoutReadyRef.current = true;
        emit({ type: "layout-ready", totalPages: event.totalPages });
        bump();
      }),
      scroll?.onLayoutChange((event) => {
        if (!forDocument(event)) return;
        emit({ type: "layout-change" });
        bump();
      }),
      viewport?.onViewportResize((event) => {
        if (forDocument(event)) bump();
      }),
      // The viewport applies these on its next animation frame, after the
      // layout effect that requested them has already positioned the pages.
      viewportPlugin?.onScrollRequest(documentId, (scrollRequest) => {
        emit({ type: "scroll-request", top: scrollRequest.y });
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe?.();
    };
  }, [
    zoom,
    spread,
    rotate,
    scroll,
    viewport,
    viewportPlugin,
    documentId,
    bump,
  ]);

  useLayoutEffect(() => {
    if (!request || !layoutReadyRef.current) return;
    const landed = landedRef.current;
    const requested = requestedRef.current;
    const refusals = refusalsRef.current;
    const settle = (kind: CarriedKind) => {
      landed[kind] = true;
      onEventRef.current?.({ type: kind });
    };
    // A value is never confirmed in the run that requested it: the pages have
    // not re-rendered at the new geometry yet. The plugin's change re-runs
    // this, and the value is confirmed in the commit that shows it.
    const reconcile = (
      kind: CarriedKind,
      matches: () => boolean,
      apply: () => void,
    ) => {
      if (landed[kind]) return;
      if (matches() || refusals[kind] >= MAX_REFUSALS) {
        settle(kind);
        return;
      }
      requested[kind] = true;
      try {
        apply();
      } catch {
        // The next plugin event re-runs this.
        requested[kind] = false;
      }
    };

    // Rotation and spread reflow the pages, and a fit zoom is computed
    // against that layout, so they go first.
    if (request.rotation === null) {
      landed.rotation = true;
    } else if (rotate) {
      const scope = rotate.forDocument(documentId);
      const target = request.rotation as Rotation;
      reconcile(
        "rotation",
        () => scope.getRotation() === target,
        () => scope.setRotation(target),
      );
    }
    if (request.spread === null) {
      landed.spread = true;
    } else if (spread) {
      const scope = spread.forDocument(documentId);
      const target = request.spread;
      reconcile(
        "spread",
        () => scope.getSpreadMode() === target,
        () => scope.setSpreadMode(target),
      );
    }
    if (request.zoom === null) {
      landed.zoom = true;
    } else if (zoom) {
      const scope = zoom.forDocument(documentId);
      const target = request.zoom;
      reconcile(
        "zoom",
        () =>
          zoomMatches(scope.getState(), target) &&
          (typeof target === "number" || zoomPassSeenRef.current),
        () => scope.requestZoom(target),
      );
    }
  }, [request, zoom, spread, rotate, documentId, tick]);

  return null;
}
