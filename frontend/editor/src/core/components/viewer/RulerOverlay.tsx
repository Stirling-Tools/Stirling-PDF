import React, { useCallback, useEffect, useRef, useState } from "react";
import { useViewer } from "@app/contexts/ViewerContext";
import type {
  MeasureScale,
  Measurement,
  PageMeasureScales,
  PagePoint,
} from "@app/utils/measurementTypes";
import { validateMeasurement } from "@app/utils/measurementUtils";
import type { ScaleCalibrationMeasurement } from "@app/components/viewer/ScaleCalibrationDialog";
import {
  RulerMeasurementLayer,
  type RulerLabelVisibilityMode,
  type RulerRenderedMeasurement,
} from "@app/components/viewer/RulerMeasurementLayer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

let rulerMeasurementIdCounter = 0;

function createRulerMeasurementId(): string {
  rulerMeasurementIdCounter += 1;
  return `ruler-${Date.now().toString(36)}-${rulerMeasurementIdCounter.toString(36)}`;
}

export interface RulerOverlayHandle {
  clearAll: (silent?: boolean) => void;
  getMeasurements: () => Measurement[];
  setMeasurements: (measurements: Measurement[]) => void;
  /** Restore measurements without triggering notification */
  restoreMeasurements: (measurements: Measurement[]) => void;
  /** Register a callback to be notified when measurements change from user actions */
  onMeasurementsChange: (
    callback: (measurements: Measurement[]) => void,
  ) => () => void;
}

interface RulerOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
  pageMeasureScales?: PageMeasureScales | null;
  customScale?: MeasureScale | null;
  isCalibrationActive?: boolean;
  onCalibrationMeasure?: (measurement: ScaleCalibrationMeasurement) => void;
}

// ─── Math ─────────────────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/**
 * Given the start/end PagePoints of a measurement, find the scale from the
 * viewport whose BBox contains the midpoint. Falls back to customScale if provided,
 * then to the first viewport if none contains it (handles whole-page viewports with bbox=null).
 */
function pickScale(
  start: PagePoint,
  end: PagePoint,
  pageMeasureScales: PageMeasureScales | null | undefined,
  customScale?: MeasureScale | null,
): MeasureScale | null {
  // Cross-page measurements are meaningless — reject regardless of scale source
  if (start.pageIndex !== end.pageIndex) return null;

  // Priority 1: Use custom scale if provided
  if (customScale) return customScale;

  if (!pageMeasureScales) return null;
  const info = pageMeasureScales.get(start.pageIndex);
  if (!info?.viewports.length) return null;

  // Midpoint in screen-space page coords (x left→right, y top→bottom, PDF points)
  const mx = (start.x + end.x) / 2;
  // Flip y: screen y=0 is page top; PDF user space y=0 is page bottom
  const my = info.pageHeight - (start.y + end.y) / 2;

  for (const { bbox, scale } of info.viewports) {
    if (!bbox) return scale; // whole-page viewport
    const [x0, y0, x1, y1] = bbox;
    if (
      mx >= Math.min(x0, x1) &&
      mx <= Math.max(x0, x1) &&
      my >= Math.min(y0, y1) &&
      my <= Math.max(y0, y1)
    ) {
      return scale;
    }
  }
  return null;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function findScrollEl(root: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    if (el === root) continue;
    const { overflow, overflowY, overflowX } = window.getComputedStyle(el);
    if (
      [overflow, overflowY, overflowX].some(
        (v) => v === "auto" || v === "scroll",
      )
    ) {
      return el;
    }
  }
  return null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("input, textarea, select") !== null
  );
}

function findPageAtClientPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const pages = container.querySelectorAll("[data-page-index]");

  for (const pageNode of pages) {
    const pageEl = pageNode as HTMLElement;
    const rect = pageEl.getBoundingClientRect();

    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return pageEl;
    }
  }

  return null;
}

/**
 * Find the nearest point on any page boundary and return it as both
 * an SVG screen coordinate and a PagePoint (page-relative PDF units).
 * Used to clamp the live line when the cursor drifts off the page.
 */
function nearestPageDocPt(
  cursor: Point,
  container: HTMLElement,
  zoom: number,
): { screenPt: Point; docPt: PagePoint } | null {
  const pages = container.querySelectorAll("[data-page-index]");
  if (!pages.length) return null;

  const cr = container.getBoundingClientRect();
  let bestDist = Infinity;
  let best: { screenPt: Point; docPt: PagePoint } | null = null;

  pages.forEach((pageNode) => {
    const pageEl = pageNode as HTMLElement;
    const r = pageEl.getBoundingClientRect();
    const pageIndex = parseInt(pageEl.dataset.pageIndex ?? "0", 10);

    // Page bounds in SVG (container-relative) space
    const left = r.left - cr.left;
    const top = r.top - cr.top;
    const right = r.right - cr.left;
    const bottom = r.bottom - cr.top;

    // Nearest point on this rect to the cursor (SVG space)
    const cx = Math.max(left, Math.min(right, cursor.x));
    const cy = Math.max(top, Math.min(bottom, cursor.y));
    const d = Math.sqrt((cursor.x - cx) ** 2 + (cursor.y - cy) ** 2);

    if (d < bestDist) {
      bestDist = d;
      // Convert SVG-space point (cx, cy) → page-relative viewport → PDF points:
      //   viewport position of cx = cr.left + cx
      //   page-relative position  = (cr.left + cx) - r.left
      //   PDF units               = page-relative / zoom
      best = {
        screenPt: { x: cx, y: cy },
        docPt: {
          pageIndex,
          x: (cr.left + cx - r.left) / zoom,
          y: (cr.top + cy - r.top) / zoom,
        },
      };
    }
  });

  return best;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export const RulerOverlay = React.forwardRef<
  RulerOverlayHandle,
  RulerOverlayProps
>(function RulerOverlayImpl(
  {
    containerRef,
    isActive,
    pageMeasureScales,
    customScale,
    isCalibrationActive = false,
    onCalibrationMeasure,
  }: RulerOverlayProps,
  ref,
) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [firstPt, setFirstPt] = useState<PagePoint | null>(null);
  /** Current cursor in SVG screen-space — for live crosshair and live line rendering. */
  const [cursorS, setCursorS] = useState<Point | null>(null);
  /** Current cursor in page-relative PDF units — for finalising off-page clicks. */
  const [cursorDoc, setCursorDoc] = useState<PagePoint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [labelVisibilityMode, setLabelVisibilityMode] =
    useState<RulerLabelVisibilityMode>("hideSmall");
  const [isDrawThroughActive, setIsDrawThroughActive] = useState(false);

  // Callbacks for explicit measurement changes; restores stay silent.
  const measurementsListenersRef = useRef<
    Set<(measurements: Measurement[]) => void>
  >(new Set());
  const measurementsRef = useRef<Measurement[]>(measurements);

  /**
   * Incremented on scroll to trigger re-renders.
   * We no longer store the scroll value — getBoundingClientRect handles that
   * automatically and is always accurate regardless of scroll position.
   */
  const [, setScrollVersion] = useState(0);

  const scrollElRef = useRef<HTMLElement | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const firstPtRef = useRef<PagePoint | null>(null);
  useEffect(() => {
    firstPtRef.current = firstPt;
  }, [firstPt]);

  const cursorDocRef = useRef<PagePoint | null>(null);
  const wasCalibrationActiveRef = useRef(isCalibrationActive);
  const drawThroughActiveRef = useRef(false);

  const setDrawThroughMode = useCallback((isEnabled: boolean) => {
    drawThroughActiveRef.current = isEnabled;
    setIsDrawThroughActive(isEnabled);

    if (isEnabled) {
      setHoveredId(null);
    }
  }, []);

  const notifyMeasurementsChange = useCallback(
    (nextMeasurements: Measurement[]) => {
      measurementsListenersRef.current.forEach((listener) =>
        listener(nextMeasurements),
      );
    },
    [],
  );

  const replaceMeasurements = useCallback(
    (nextMeasurements: Measurement[], notify = false) => {
      measurementsRef.current = nextMeasurements;
      setMeasurements(nextMeasurements);
      if (notify) {
        notifyMeasurementsChange(nextMeasurements);
      }
    },
    [notifyMeasurementsChange],
  );

  const updateMeasurements = useCallback(
    (
      updater: (currentMeasurements: Measurement[]) => Measurement[],
      notify = false,
    ) => {
      replaceMeasurements(updater(measurementsRef.current), notify);
    },
    [replaceMeasurements],
  );

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const viewer = useViewer();
  const { registerImmediateZoomUpdate } = viewer;

  const [zoom, setZoom] = useState<number>(() => {
    try {
      return ((viewer.getZoomState() as any)?.zoomPercent ?? 140) / 100;
    } catch {
      return 1.4;
    }
  });

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    return registerImmediateZoomUpdate((pct) => {
      const newZoom = pct / 100;
      zoomRef.current = newZoom; // immediate for event-listener closures
      setZoom(newZoom); // re-render #1: zoom updated, but PDF.js DOM may not be yet
      // re-render #2: after PDF.js has updated page element dimensions in the DOM,
      // so getBoundingClientRect returns the correct positions for the new zoom level.
      requestAnimationFrame(() => setScrollVersion((n) => n + 1));
    });
  }, [registerImmediateZoomUpdate]);

  // ── Layout change tracking (menu close, sidebar toggle, etc.) ──────────────
  // Monitor PDF container for layout changes and force re-render so measurements
  // use updated getBoundingClientRect positions after layout reflow
  useEffect(() => {
    if (!containerRef.current) return;

    const handleLayoutChange = () => {
      // Layout changed - force re-render to recalculate coordinates from getBoundingClientRect
      setScrollVersion((n) => n + 1);
    };

    // Use ResizeObserver if available, otherwise fall back to window resize event
    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(handleLayoutChange);
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    } else {
      // Fallback for environments without ResizeObserver (legacy browsers, embedded webviews)
      window.addEventListener("resize", handleLayoutChange);
      return () => window.removeEventListener("resize", handleLayoutChange);
    }
  }, [containerRef]);

  // ── Scroll tracking ────────────────────────────────────────────────────────
  // We only need re-renders on scroll; getBoundingClientRect gives us accurate
  // positions without needing to know the scroll offset ourselves.

  const attachScrollEl = useCallback((el: HTMLElement) => {
    scrollCleanupRef.current?.();
    scrollElRef.current = el;
    const handler = () => setScrollVersion((n) => n + 1);
    el.addEventListener("scroll", handler, { passive: true });
    scrollCleanupRef.current = () => el.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tryAttach = () => {
      const el = findScrollEl(container);
      if (el) {
        attachScrollEl(el);
        return true;
      }
      return false;
    };

    if (!tryAttach()) {
      const timer = setTimeout(() => tryAttach(), 600);
      return () => {
        clearTimeout(timer);
        scrollCleanupRef.current?.();
      };
    }
    return () => scrollCleanupRef.current?.();
  }, [containerRef, attachScrollEl]);

  // Re-find scroll element when zoom changes (PDF.js may recreate the scroll DOM).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = findScrollEl(container);
    if (el && el !== scrollElRef.current) attachScrollEl(el);
  }, [zoom, containerRef, attachScrollEl]);

  // ── Imperative handle ──────────────────────────────────────────────────────
  React.useImperativeHandle(ref, () => ({
    clearAll: (silent = false) => {
      replaceMeasurements([], !silent);
      setFirstPt(null);
      setCursorS(null);
      setCursorDoc(null);
      setSelectedId(null);
      setHoveredId(null);
    },
    getMeasurements: () => measurementsRef.current,
    setMeasurements: (newMeasurements: Measurement[]) => {
      // Validate all measurements before setting state
      const validated = newMeasurements.filter((m) => validateMeasurement(m));
      replaceMeasurements(validated, true);
    },
    restoreMeasurements: (newMeasurements: Measurement[]) => {
      replaceMeasurements(
        newMeasurements.filter((measurement) =>
          validateMeasurement(measurement),
        ),
        false,
      );
    },
    onMeasurementsChange: (callback: (measurements: Measurement[]) => void) => {
      measurementsListenersRef.current.add(callback);
      // Return unsubscribe function
      return () => {
        measurementsListenersRef.current.delete(callback);
      };
    },
  }));

  // ── Reset when deactivated ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      setFirstPt(null);
      setCursorS(null);
      setCursorDoc(null);
      setSelectedId(null);
      setHoveredId(null);
      setDrawThroughMode(false);
    }
  }, [isActive, setDrawThroughMode]);

  useEffect(() => {
    const wasCalibrationActive = wasCalibrationActiveRef.current;
    wasCalibrationActiveRef.current = isCalibrationActive;

    if (wasCalibrationActive && !isCalibrationActive) {
      firstPtRef.current = null;
      cursorDocRef.current = null;
      setFirstPt(null);
      setCursorS(null);
      setCursorDoc(null);
    }
  }, [isCalibrationActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || isEditableKeyboardTarget(e.target)) {
        return;
      }

      e.preventDefault();
      setDrawThroughMode(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setDrawThroughMode(false);
      }
    };

    const onBlur = () => {
      setDrawThroughMode(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setDrawThroughMode(false);
    };
  }, [isActive, setDrawThroughMode]);

  // ── Mouse events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!isActive || !el) return;

    const toScreenPt = (e: MouseEvent): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    /**
     * Convert a mouse event to a page-relative PagePoint.
     * Returns null if the cursor is not over a page.
     */
    const toDocPagePt = (e: MouseEvent): PagePoint | null => {
      const pageEl = findPageAtClientPoint(el, e.clientX, e.clientY);
      if (!pageEl) return null;
      const pageIndex = parseInt(pageEl.dataset.pageIndex ?? "0", 10);
      const r = pageEl.getBoundingClientRect();
      const z = zoomRef.current;
      return {
        pageIndex,
        x: (e.clientX - r.left) / z,
        y: (e.clientY - r.top) / z,
      };
    };

    const clearCursor = () => {
      setCursorS(null);
      setCursorDoc(null);
      cursorDocRef.current = null;
    };

    const onMove = (e: MouseEvent) => {
      const screenPt = toScreenPt(e);
      const docPt = toDocPagePt(e);

      if (docPt) {
        el.style.cursor = "crosshair";
        setCursorS(screenPt);
        setCursorDoc(docPt);
        cursorDocRef.current = docPt;
      } else if (firstPtRef.current !== null) {
        // First point placed, cursor wandered off page — clamp to nearest edge
        el.style.cursor = "crosshair";
        const result = nearestPageDocPt(screenPt, el, zoomRef.current);
        if (result) {
          setCursorS(result.screenPt);
          setCursorDoc(result.docPt);
          cursorDocRef.current = result.docPt;
        }
      } else {
        el.style.cursor = "default";
        clearCursor();
      }
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element;
      if (target.closest?.("[data-ruler-control]")) return;

      const hasMeasurementInProgress =
        firstPtRef.current !== null || drawThroughActiveRef.current || e.altKey;
      if (
        !hasMeasurementInProgress &&
        target.closest?.("[data-ruler-interactive]")
      ) {
        return;
      }

      const dp = toDocPagePt(e);
      const overPage = dp !== null;
      if (!overPage && firstPtRef.current === null) return;
      e.preventDefault();

      const nextPoint = dp ?? cursorDocRef.current;
      if (!nextPoint) return;

      const prev = firstPtRef.current;
      if (!prev) {
        firstPtRef.current = nextPoint;
        setFirstPt(nextPoint);
        setSelectedId(null);
        setHoveredId(null);
        return;
      }

      // CRITICAL: Reject cross-page measurements
      // Measurements must have both points on the same page
      if (prev.pageIndex !== nextPoint.pageIndex) {
        console.warn(
          "[Ruler] Cross-page measurements not allowed. Resetting measurement.",
          `Start: page ${prev.pageIndex}, End: page ${nextPoint.pageIndex}`,
        );
        // Reset first point so user can start fresh on same page
        firstPtRef.current = null;
        setFirstPt(null);
        setCursorS(null);
        setCursorDoc(null);
        return;
      }

      firstPtRef.current = null;
      setFirstPt(null);

      if (isCalibrationActive) {
        const distancePts = dist(prev, nextPoint);
        if (distancePts > 0) {
          onCalibrationMeasure?.({
            start: prev,
            end: nextPoint,
            pdfDistancePts: distancePts,
          });
        }
        return;
      }

      const id = createRulerMeasurementId();
      updateMeasurements(
        (m) => [...m, { id, start: prev, end: nextPoint }],
        true,
      );
    };

    const onLeave = () => {
      el.style.cursor = "";
      if (firstPtRef.current === null) clearCursor();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFirstPt(null);
        setCursorS(null);
        setCursorDoc(null);
      }
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("click", onClick);
    el.addEventListener("mouseleave", onLeave);
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("click", onClick);
      el.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("keydown", onKey);
      el.style.cursor = "";
    };
  }, [
    containerRef,
    isActive,
    isCalibrationActive,
    onCalibrationMeasure,
    updateMeasurements,
  ]);

  const deleteMeasurement = useCallback(
    (id: string) => {
      updateMeasurements((prev) => prev.filter((m) => m.id !== id), true);
      // Close expanded label if the deleted measurement was selected
      if (selectedId === id) {
        setSelectedId(null);
      }
      if (hoveredId === id) {
        setHoveredId(null);
      }
    },
    [hoveredId, selectedId, updateMeasurements],
  );

  if (!isActive && measurements.length === 0) return null;

  // ── PagePoint → SVG screen coordinates ────────────────────────────────────
  /**
   * Convert a page-anchored point to SVG screen coordinates.
   *
   * Uses getBoundingClientRect so the browser computes the exact screen position
   * accounting for scroll, zoom, page margins, centering — everything. This is
   * why we no longer need to track scroll offsets.
   *
   * Returns null if the page element isn't in the DOM (shouldn't happen with
   * PDF.js placeholder divs, but guard anyway).
   */
  const pagePointToScreen = (pt: PagePoint): Point | null => {
    const container = containerRef.current;
    if (!container) return null;
    const pageEl = container.querySelector(
      `[data-page-index="${pt.pageIndex}"]`,
    ) as HTMLElement | null;
    if (!pageEl) return null;
    const pageRect = pageEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      x: pageRect.left - containerRect.left + pt.x * zoom,
      y: pageRect.top - containerRect.top + pt.y * zoom,
    };
  };

  const firstPtS = firstPt ? pagePointToScreen(firstPt) : null;
  const renderedMeasurements = measurements.reduce<RulerRenderedMeasurement[]>(
    (items, measurement) => {
      const startS = pagePointToScreen(measurement.start);
      const endS = pagePointToScreen(measurement.end);
      if (!startS || !endS) {
        return items;
      }

      const measureScale = pickScale(
        measurement.start,
        measurement.end,
        pageMeasureScales,
        customScale,
      );

      items.push({
        measurement,
        startS,
        endS,
        distPts: dist(startS, endS) / zoom,
        measureScale,
      });
      return items;
    },
    [],
  );
  const isMeasurementInteractionPassthroughActive =
    firstPt !== null || isDrawThroughActive;
  const liveLine =
    isActive && firstPtS && cursorS
      ? {
          startS: firstPtS,
          endS: cursorS,
          measureScale:
            !isCalibrationActive && firstPt && cursorDoc
              ? pickScale(firstPt, cursorDoc, pageMeasureScales, customScale)
              : null,
        }
      : null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 100,
      }}
      onClick={(e) => {
        // Close expanded label if clicking on empty SVG area
        if (e.target === e.currentTarget) {
          setSelectedId(null);
        }
      }}
    >
      <defs>
        <filter id="ruler-shadow" x="-20%" y="-50%" width="140%" height="200%">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="2"
            floodColor="rgba(0,0,0,0.22)"
          />
        </filter>
      </defs>

      <RulerMeasurementLayer
        measurements={renderedMeasurements}
        zoom={zoom}
        selectedId={selectedId}
        hoveredId={hoveredId}
        labelVisibilityMode={labelVisibilityMode}
        isInteractionPassthroughActive={
          isMeasurementInteractionPassthroughActive
        }
        liveLine={liveLine}
        firstPoint={isActive ? firstPtS : null}
        cursor={isActive ? cursorS : null}
        onSelect={setSelectedId}
        onDelete={deleteMeasurement}
        onHoverChange={setHoveredId}
        onClearAll={() => {
          replaceMeasurements([], true);
          setSelectedId(null);
          setHoveredId(null);
        }}
        onLabelVisibilityModeChange={setLabelVisibilityMode}
      />
    </svg>
  );
});

RulerOverlay.displayName = "RulerOverlay";
