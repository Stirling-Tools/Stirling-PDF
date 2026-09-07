import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  restorePosition,
  transformPosition,
  transformSize,
  type Rotation,
  type Size,
} from "@embedpdf/models";
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

function normalizeRotation(rotation: number | null | undefined): Rotation {
  const value =
    typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;
  return (((Math.round(value) % 4) + 4) % 4) as Rotation;
}

function getPageRotation(pageEl: HTMLElement): Rotation {
  return normalizeRotation(Number(pageEl.dataset.pageRotation));
}

function getEffectivePageRotation(
  pageEl: HTMLElement,
  documentRotation: Rotation,
): Rotation {
  return normalizeRotation(getPageRotation(pageEl) + documentRotation);
}

function getPageNaturalSize(
  pageEl: HTMLElement,
  pageRect: DOMRect,
  zoom: number,
  rotation: Rotation,
): Size {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const dataWidth = Number(pageEl.dataset.pageWidth);
  const dataHeight = Number(pageEl.dataset.pageHeight);

  if (
    Number.isFinite(dataWidth) &&
    dataWidth > 0 &&
    Number.isFinite(dataHeight) &&
    dataHeight > 0
  ) {
    return {
      width: dataWidth / safeZoom,
      height: dataHeight / safeZoom,
    };
  }

  const visualWidth = pageRect.width / safeZoom;
  const visualHeight = pageRect.height / safeZoom;
  return rotation % 2 === 0
    ? { width: visualWidth, height: visualHeight }
    : { width: visualHeight, height: visualWidth };
}

function clampToPage(point: Point, pageSize: Size): Point {
  return {
    x: Math.max(0, Math.min(pageSize.width, point.x)),
    y: Math.max(0, Math.min(pageSize.height, point.y)),
  };
}

function clientPointToPagePoint(
  pageEl: HTMLElement,
  clientX: number,
  clientY: number,
  zoom: number,
  rotation: Rotation,
): Point {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const pageRect = pageEl.getBoundingClientRect();
  const pageSize = getPageNaturalSize(pageEl, pageRect, safeZoom, rotation);
  const rotatedDisplaySize = transformSize(pageSize, rotation, safeZoom);
  const displayPoint = {
    x: clientX - pageRect.left,
    y: clientY - pageRect.top,
  };

  return clampToPage(
    restorePosition(rotatedDisplaySize, displayPoint, rotation, safeZoom),
    pageSize,
  );
}

function pagePointToDisplayPoint(
  pageEl: HTMLElement,
  pageRect: DOMRect,
  point: Point,
  zoom: number,
  rotation: Rotation,
): Point {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const pageSize = getPageNaturalSize(pageEl, pageRect, safeZoom, rotation);
  return transformPosition(pageSize, point, rotation, safeZoom);
}

/**
 * Given the start/end PagePoints of a measurement, find the scale from the
 * custom scale, then the viewport whose BBox contains the midpoint, then the
 * first whole-page viewport with bbox=null.
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

  let fallbackScale: MeasureScale | null = null;

  for (const { bbox, scale } of info.viewports) {
    if (!bbox) {
      fallbackScale ??= scale;
      continue;
    }

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
  return fallbackScale;
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
  const elementsAtPoint = document.elementsFromPoint(clientX, clientY);

  for (const element of elementsAtPoint) {
    const pageEl = element.closest?.("[data-page-index]");
    if (pageEl instanceof HTMLElement && container.contains(pageEl)) {
      return pageEl;
    }
  }

  return null;
}

/**
 * Find the nearest point on the starting page boundary and return it as both
 * an SVG screen coordinate and a PagePoint (page-relative PDF units).
 * Used to clamp the live line when the cursor drifts off the page.
 */
function nearestPageDocPt(
  cursor: Point,
  container: HTMLElement,
  zoom: number,
  documentRotation: Rotation,
  pageIndex: number,
): { screenPt: Point; docPt: PagePoint } | null {
  const pageEl = container.querySelector(
    `[data-page-index="${pageIndex}"]`,
  ) as HTMLElement | null;
  if (!pageEl) return null;

  const cr = container.getBoundingClientRect();
  const r = pageEl.getBoundingClientRect();
  const effectiveRotation = getEffectivePageRotation(pageEl, documentRotation);

  // Page bounds in SVG (container-relative) space
  const left = r.left - cr.left;
  const top = r.top - cr.top;
  const right = r.right - cr.left;
  const bottom = r.bottom - cr.top;

  // Nearest point on this rect to the cursor (SVG space)
  const cx = Math.max(left, Math.min(right, cursor.x));
  const cy = Math.max(top, Math.min(bottom, cursor.y));
  const docPoint = clientPointToPagePoint(
    pageEl,
    cr.left + cx,
    cr.top + cy,
    zoom,
    effectiveRotation,
  );

  return {
    screenPt: { x: cx, y: cy },
    docPt: {
      pageIndex,
      x: docPoint.x,
      y: docPoint.y,
    },
  };
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
  const scrollRafRef = useRef<number | null>(null);
  const rulerPageContentRef = useRef<SVGGElement | null>(null);
  const renderedScrollRef = useRef({ left: 0, top: 0 });
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

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

  const cycleLabelVisibilityMode = useCallback(() => {
    setLabelVisibilityMode((currentMode) => {
      if (currentMode === "hideSmall") {
        return "showAll";
      }

      if (currentMode === "showAll") {
        return "hideAll";
      }

      return "hideSmall";
    });
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
  const { registerImmediateRotationUpdate, registerImmediateZoomUpdate } =
    viewer;

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

  const [rotation, setRotation] = useState<Rotation>(() => {
    try {
      return normalizeRotation(viewer.getRotationState().rotation);
    } catch {
      return normalizeRotation(0);
    }
  });

  const rotationRef = useRef<Rotation>(rotation);
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

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

  useEffect(() => {
    return registerImmediateRotationUpdate((nextRotation) => {
      const normalizedRotation = normalizeRotation(nextRotation);
      rotationRef.current = normalizedRotation;
      setRotation(normalizedRotation);
      requestAnimationFrame(() => setScrollVersion((n) => n + 1));
    });
  }, [registerImmediateRotationUpdate]);

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
  // Native scrolling moves the PDF pages before React re-renders this fixed
  // overlay. Translate page-anchored SVG content immediately, then let the next
  // frame render exact coordinates from getBoundingClientRect.

  useLayoutEffect(() => {
    const scrollEl = scrollElRef.current;
    if (scrollEl) {
      renderedScrollRef.current = {
        left: scrollEl.scrollLeft,
        top: scrollEl.scrollTop,
      };
    }
    rulerPageContentRef.current?.removeAttribute("transform");
  });

  const attachScrollEl = useCallback((el: HTMLElement) => {
    scrollCleanupRef.current?.();
    scrollElRef.current = el;
    const handler = () => {
      if (!isActiveRef.current && measurementsRef.current.length === 0) {
        return;
      }

      const dx = renderedScrollRef.current.left - el.scrollLeft;
      const dy = renderedScrollRef.current.top - el.scrollTop;
      if (dx !== 0 || dy !== 0) {
        rulerPageContentRef.current?.setAttribute(
          "transform",
          `translate(${dx} ${dy})`,
        );
      }

      if (scrollRafRef.current !== null) {
        return;
      }

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setScrollVersion((n) => n + 1);
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    scrollCleanupRef.current = () => {
      el.removeEventListener("scroll", handler);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
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
      firstPtRef.current = null;
      cursorDocRef.current = null;
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
      firstPtRef.current = null;
      cursorDocRef.current = null;
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

    if (wasCalibrationActive !== isCalibrationActive) {
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
      const z = zoomRef.current;
      const effectiveRotation = getEffectivePageRotation(
        pageEl,
        rotationRef.current,
      );
      const docPoint = clientPointToPagePoint(
        pageEl,
        e.clientX,
        e.clientY,
        z,
        effectiveRotation,
      );
      return {
        pageIndex,
        x: docPoint.x,
        y: docPoint.y,
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
        const result = nearestPageDocPt(
          screenPt,
          el,
          zoomRef.current,
          rotationRef.current,
          firstPtRef.current.pageIndex,
        );
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
        // Reset first point so user can start fresh on same page
        firstPtRef.current = null;
        cursorDocRef.current = null;
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
        firstPtRef.current = null;
        cursorDocRef.current = null;
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
    const effectiveRotation = getEffectivePageRotation(pageEl, rotation);
    const displayPoint = pagePointToDisplayPoint(
      pageEl,
      pageRect,
      pt,
      zoom,
      effectiveRotation,
    );
    return {
      x: pageRect.left - containerRect.left + displayPoint.x,
      y: pageRect.top - containerRect.top + displayPoint.y,
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
        distPts: dist(measurement.start, measurement.end),
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
        pageContentRef={rulerPageContentRef}
        onSelect={setSelectedId}
        onDelete={deleteMeasurement}
        onHoverChange={setHoveredId}
        onClearAll={() => {
          replaceMeasurements([], true);
          setSelectedId(null);
          setHoveredId(null);
        }}
        onCycleLabelVisibilityMode={cycleLabelVisibilityMode}
      />
    </svg>
  );
});

RulerOverlay.displayName = "RulerOverlay";
