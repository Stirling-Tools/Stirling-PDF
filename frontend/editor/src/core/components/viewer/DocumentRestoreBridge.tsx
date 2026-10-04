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

/** `scroll-request` fires before the viewport applies that scroll, on its next frame. */
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
  restorePending: boolean;
  onEvent?: (event: DocumentRestoreEvent) => void;
}

// Answers that are not the carried value; a dropped request does not count.
const MAX_REFUSALS = 5;

const zoomMatches = (state: ZoomDocumentState, target: ZoomLevel) =>
  typeof target === "number"
    ? typeof state.zoomLevel === "number" &&
      Math.abs(state.currentZoomLevel - target) < 0.001
    : state.zoomLevel === target;

/**
 * Carries zoom, spread and rotation onto a replacement document. The zoom
 * plugin silently drops a request made before the viewport is measured, so
 * every later plugin event re-checks; the viewport applies plugin scrolls a
 * frame later, so those requests are forwarded for the viewer to correct.
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
  // forDocument() returns a fresh object per call: derive scopes inside effects.
  const { provides: zoom } = useZoomCapability();
  const { provides: spread } = useSpreadCapability();
  const { provides: rotate } = useRotateCapability();
  const { provides: scroll } = useScrollCapability();
  const { provides: viewport } = useViewportCapability();
  const { plugin: viewportPlugin } = useViewportPlugin();
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
  // Until measured, a replacement sits at a placeholder scale in its default mode.
  const zoomPassSeenRef = useRef(false);
  // A spread changed while the state bridges mount reaches the toolbar out of order.
  const layoutReadyRef = useRef(false);

  useLayoutEffect(() => {
    const forDocument = (event: { documentId: string }) =>
      event.documentId === documentId;
    const emit = (event: DocumentRestoreEvent) => onEventRef.current?.(event);
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
    // Never confirmed in the run that requested it: the pages have not re-rendered.
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
        requested[kind] = false;
      }
    };

    // Rotation and spread first: a fit zoom is computed against their layout.
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
