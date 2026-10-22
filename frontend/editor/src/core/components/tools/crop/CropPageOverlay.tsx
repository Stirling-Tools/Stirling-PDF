import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  CROP_HANDLES,
  drawRect,
  moveRect,
  resizeRect,
  type CropHandle,
  type NormalizedRect,
} from "@app/components/tools/crop/cropInteractionMath";
import {
  MM_PER_POINT,
  displayRectToPage,
  getDisplaySize,
  isFullPageRect,
  normalizeRotation,
  pageRectToDisplay,
  type CropPageGeometry,
  type PageRotation,
} from "@app/utils/cropPageGeometry";
import type { Rectangle } from "@app/utils/cropCoordinates";
import { useCropViewerSession } from "@app/components/tools/crop/cropViewerSession";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { requestMobileView } from "@app/services/mobileViewBridge";
import { Button } from "@app/ui/Button";
import classes from "@app/components/tools/crop/CropPageOverlay.module.css";

interface CropPageOverlayProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
}

interface PageTarget {
  left: number;
  top: number;
  width: number;
  height: number;
  pageNumber: number;
  geometry: CropPageGeometry;
}

interface DragState {
  kind: "draw" | "move" | "resize";
  handle?: CropHandle;
  anchor: { x: number; y: number };
  start: NormalizedRect;
  target: PageTarget;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const SNAP_THRESHOLD = 0.01;

function snapCoordinate(value: number): number {
  for (const candidate of [0, 0.5, 1]) {
    if (Math.abs(value - candidate) < SNAP_THRESHOLD) return candidate;
  }
  return value;
}

function findScrollEl(root: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    if (el === root) continue;
    const { overflow, overflowY, overflowX } = window.getComputedStyle(el);
    if (
      [overflow, overflowY, overflowX].some(
        (value) => value === "auto" || value === "scroll",
      )
    ) {
      return el;
    }
  }
  return null;
}

function pageElementAt(
  container: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const page = element.closest?.("[data-page-index]");
    if (page instanceof HTMLElement && container.contains(page)) return page;
  }
  return null;
}

function nearestPage(
  container: HTMLElement,
  zoom: number,
  documentRotation: PageRotation,
): PageTarget | null {
  const containerRect = container.getBoundingClientRect();
  const centerX = containerRect.left + containerRect.width / 2;
  const centerY = containerRect.top + containerRect.height / 2;
  const probes: Array<[number, number]> = [
    [0, 0],
    [0, -0.3],
    [0, 0.3],
    [-0.3, 0],
    [0.3, 0],
  ];
  let page: HTMLElement | null = null;
  for (const [dx, dy] of probes) {
    page = pageElementAt(
      container,
      centerX + dx * containerRect.width,
      centerY + dy * containerRect.height,
    );
    if (page) break;
  }
  if (!page) return null;

  const rect = page.getBoundingClientRect();
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.bottom < containerRect.top ||
    rect.top > containerRect.bottom
  ) {
    return null;
  }

  const naturalWidth = Number(page.dataset.pageWidth);
  const naturalHeight = Number(page.dataset.pageHeight);
  const pageRotation = Number(page.dataset.pageRotation);
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    left: rect.left - containerRect.left,
    top: rect.top - containerRect.top,
    width: rect.width,
    height: rect.height,
    pageNumber: Number(page.dataset.pageIndex ?? 0) + 1,
    geometry: {
      viewBox: [0, 0, naturalWidth / safeZoom, naturalHeight / safeZoom],
      rotation: normalizeRotation(pageRotation + documentRotation),
    },
  };
}

function normalizedSelection(
  cropArea: Rectangle,
  geometry: CropPageGeometry,
): NormalizedRect {
  const display = pageRectToDisplay(cropArea, geometry);
  const size = getDisplaySize(geometry);
  const x = size.width > 0 ? clamp(display.x / size.width, 0, 1) : 0;
  const y = size.height > 0 ? clamp(display.y / size.height, 0, 1) : 0;
  return {
    x,
    y,
    width: size.width > 0 ? clamp(display.width / size.width, 0, 1 - x) : 1,
    height: size.height > 0 ? clamp(display.height / size.height, 0, 1 - y) : 1,
  };
}

/**
 * Crop surface drawn over the viewer's current page. The overlay never owns
 * the crop rectangle: every gesture writes through the shared session so the
 * tool panel, undo history and pipeline parameters stay identical.
 */
export default function CropPageOverlay({
  containerRef,
  isActive,
}: CropPageOverlayProps) {
  const { t } = useTranslation();
  const session = useCropViewerSession();
  const isMobile = useIsMobile();
  const viewer = useViewer();
  const [target, setTarget] = useState<PageTarget | null>(null);
  const targetRef = useRef<PageTarget | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const wheelZoomAccumulatorRef = useRef(0);
  const gestureFrameRef = useRef<number | null>(null);
  const revealFrameRef = useRef<number | null>(null);
  const pendingCommitRef = useRef<{
    rect: NormalizedRect;
    page: PageTarget;
  } | null>(null);
  const effectiveGeometry =
    session && target && session.geometryPageNumber === target.pageNumber
      ? session.geometry
      : (target?.geometry ?? null);

  const [zoom, setZoom] = useState(() => {
    try {
      return viewer.getZoomState().zoomPercent / 100;
    } catch {
      return 1;
    }
  });
  const [documentRotation, setDocumentRotation] = useState<PageRotation>(() => {
    try {
      return normalizeRotation(viewer.getRotationState().rotation);
    } catch {
      return 0;
    }
  });

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = nearestPage(container, zoom, documentRotation);
    targetRef.current = next;
    setTarget(next);
  }, [containerRef, documentRotation, zoom]);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  const measureUntilSettled = useCallback(() => {
    if (revealFrameRef.current !== null) return;
    let frames = 0;
    const tick = () => {
      scheduleMeasure();
      frames += 1;
      revealFrameRef.current = frames < 40 ? requestAnimationFrame(tick) : null;
    };
    revealFrameRef.current = requestAnimationFrame(tick);
  }, [scheduleMeasure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!isActive || !container) return;
    scrollElRef.current = findScrollEl(container);
  }, [containerRef, isActive, target]);

  const { zoomActions } = viewer;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!isActive || !overlay) return;

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        wheelZoomAccumulatorRef.current += event.deltaY;
        if (Math.abs(wheelZoomAccumulatorRef.current) >= 10) {
          if (wheelZoomAccumulatorRef.current < 0) zoomActions.zoomIn();
          else zoomActions.zoomOut();
          wheelZoomAccumulatorRef.current = 0;
        }
        return;
      }
      const scroller = scrollElRef.current;
      if (!scroller) return;
      event.preventDefault();
      scroller.scrollBy({ left: event.deltaX, top: event.deltaY });
    };

    overlay.addEventListener("wheel", onWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", onWheel);
  }, [isActive, target, zoomActions]);

  useLayoutEffect(() => {
    if (!isActive) {
      setTarget(null);
      targetRef.current = null;
      return;
    }
    measure();
  }, [isActive, measure]);

  const { registerImmediateZoomUpdate, registerImmediateRotationUpdate } =
    viewer;

  useEffect(() => {
    if (!isActive) return;
    const container = containerRef.current;
    if (!container) return;

    const unregisterZoom = registerImmediateZoomUpdate((percent) => {
      setZoom(percent / 100);
      scheduleMeasure();
    });
    const unregisterRotation = registerImmediateRotationUpdate((rotation) => {
      setDocumentRotation(normalizeRotation(rotation));
      scheduleMeasure();
    });
    const onScroll = () => scheduleMeasure();
    document.addEventListener("scroll", onScroll, true);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;
    observer?.observe(container);
    const intersection =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              measureUntilSettled();
            }
          })
        : null;
    intersection?.observe(container);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      unregisterZoom?.();
      unregisterRotation?.();
      document.removeEventListener("scroll", onScroll, true);
      observer?.disconnect();
      intersection?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (revealFrameRef.current !== null) {
        cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
    };
  }, [
    containerRef,
    isActive,
    measureUntilSettled,
    registerImmediateRotationUpdate,
    registerImmediateZoomUpdate,
    scheduleMeasure,
  ]);

  const commit = useCallback(
    (rect: NormalizedRect, page: PageTarget) => {
      const current = session;
      if (!current) return;
      const size = getDisplaySize(page.geometry);
      const area = displayRectToPage(
        {
          x: rect.x * size.width,
          y: rect.y * size.height,
          width: rect.width * size.width,
          height: rect.height * size.height,
        },
        page.geometry,
      );
      current.applyArea(area, page.geometry);
    },
    [session],
  );

  const localPoint = useCallback(
    (event: Pick<PointerEvent, "clientX" | "clientY">, page: PageTarget) => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left - page.left) / page.width, 0, 1),
        y: clamp((event.clientY - rect.top - page.top) / page.height, 0, 1),
      };
    },
    [containerRef],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = session;
      const page = targetRef.current;
      if (!current || !page || !effectiveGeometry || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = localPoint(event.nativeEvent, page);
      const start = normalizedSelection(current.cropArea, effectiveGeometry);
      const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-crop-handle]",
      )?.dataset.cropHandle as CropHandle | undefined;
      const inside =
        point.x >= start.x &&
        point.x <= start.x + start.width &&
        point.y >= start.y &&
        point.y <= start.y + start.height;
      const canMove =
        inside && !isFullPageRect(current.cropArea, effectiveGeometry);

      const kind: DragState["kind"] = handle
        ? "resize"
        : canMove
          ? "move"
          : "draw";

      dragRef.current = {
        kind,
        handle,
        anchor: point,
        start,
        target: { ...page, geometry: effectiveGeometry },
      };
      setDragging(true);
    },
    [effectiveGeometry, localPoint, session],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const current = session;
      if (!drag || !current) return;
      event.preventDefault();
      event.stopPropagation();

      const page = drag.target;
      const point = localPoint(event.nativeEvent, page);
      const display = getDisplaySize(page.geometry);
      const ratio =
        current.aspectRatio && display.width > 0
          ? current.aspectRatio * (display.height / display.width)
          : null;
      const minSize = {
        x: display.width > 0 ? 4 / display.width : 0.002,
        y: display.height > 0 ? 4 / display.height : 0.002,
      };
      const target = ratio
        ? point
        : { x: snapCoordinate(point.x), y: snapCoordinate(point.y) };

      let rect: NormalizedRect;
      if (drag.kind === "draw") {
        rect = drawRect(drag.anchor, target, ratio, minSize);
      } else if (drag.kind === "move") {
        rect = moveRect(
          drag.start,
          target.x - drag.anchor.x,
          target.y - drag.anchor.y,
        );
      } else {
        rect = resizeRect(
          drag.handle ?? "se",
          target,
          drag.start,
          ratio,
          minSize,
        );
      }

      pendingCommitRef.current = { rect, page };
      if (gestureFrameRef.current !== null) return;
      gestureFrameRef.current = requestAnimationFrame(() => {
        gestureFrameRef.current = null;
        const pending = pendingCommitRef.current;
        if (pending) commit(pending.rect, pending.page);
      });
    },
    [commit, localPoint, session],
  );
  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = null;
      setDragging(false);
      if (gestureFrameRef.current !== null) {
        cancelAnimationFrame(gestureFrameRef.current);
        gestureFrameRef.current = null;
      }
      const pending = pendingCommitRef.current;
      pendingCommitRef.current = null;
      if (pending) commit(pending.rect, pending.page);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = session;
      const page = targetRef.current;
      if (!current || !page || !effectiveGeometry) return;
      const step = event.altKey ? 0.001 : 0.005;
      const start = normalizedSelection(current.cropArea, effectiveGeometry);
      let next: NormalizedRect | null = null;

      switch (event.key) {
        case "ArrowLeft":
          next = event.shiftKey
            ? resizeRect("w", { x: start.x - step, y: start.y }, start, null, {
                x: 0.002,
                y: 0.002,
              })
            : moveRect(start, -step, 0);
          break;
        case "ArrowRight":
          next = event.shiftKey
            ? resizeRect(
                "e",
                { x: start.x + start.width + step, y: start.y },
                start,
                null,
                {
                  x: 0.002,
                  y: 0.002,
                },
              )
            : moveRect(start, step, 0);
          break;
        case "ArrowUp":
          next = event.shiftKey
            ? resizeRect("n", { x: start.x, y: start.y - step }, start, null, {
                x: 0.002,
                y: 0.002,
              })
            : moveRect(start, 0, -step);
          break;
        case "ArrowDown":
          next = event.shiftKey
            ? resizeRect(
                "s",
                { x: start.x, y: start.y + start.height + step },
                start,
                null,
                {
                  x: 0.002,
                  y: 0.002,
                },
              )
            : moveRect(start, 0, step);
          break;
        default:
          return;
      }

      event.preventDefault();
      commit(next, { ...page, geometry: effectiveGeometry });
    },
    [commit, effectiveGeometry, session],
  );

  useEffect(() => {
    if (!isActive || !target || !session) return;
    if (session.pageNumber !== target.pageNumber) {
      session.onPageChange(target.pageNumber);
    }
  }, [isActive, session, target]);

  if (!isActive || !target || !session || !effectiveGeometry) return null;

  const geometry = effectiveGeometry;
  const displaySize = getDisplaySize(geometry);
  const selection = normalizedSelection(session.cropArea, geometry);
  const selectionWidth = selection.width * displaySize.width * MM_PER_POINT;
  const selectionHeight = selection.height * displaySize.height * MM_PER_POINT;

  return (
    <div
      ref={overlayRef}
      className={classes.overlay}
      style={{
        left: target.left,
        top: target.top,
        width: target.width,
        height: target.height,
      }}
      data-testid="crop-viewer-overlay"
      data-page-number={target.pageNumber}
      role="group"
      tabIndex={0}
      aria-label={t(
        "crop.viewer.ariaLabel",
        "Crop area on page {{page}}. Drag to draw, drag the selection to move, arrow keys nudge.",
        { page: target.pageNumber },
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      data-dragging={dragging ? "true" : undefined}
    >
      {isMobile && (
        <Button
          className={classes.mobileDone}
          variant="primary"
          size="sm"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            requestMobileView("tools");
          }}
        >
          {t("crop.viewer.done", "Done")}
        </Button>
      )}
      <div className={classes.shade} aria-hidden="true">
        <div
          className={classes.hole}
          style={{
            left: `${selection.x * 100}%`,
            top: `${selection.y * 100}%`,
            width: `${selection.width * 100}%`,
            height: `${selection.height * 100}%`,
          }}
        />
      </div>
      <div
        className={classes.selection}
        style={{
          left: `${selection.x * 100}%`,
          top: `${selection.y * 100}%`,
          width: `${selection.width * 100}%`,
          height: `${selection.height * 100}%`,
        }}
      >
        <span className={classes.sizeChip} aria-hidden="true">
          {selectionWidth.toFixed(selectionWidth >= 10 ? 0 : 1)} ×{" "}
          {selectionHeight.toFixed(selectionHeight >= 10 ? 0 : 1)} mm
        </span>
        {CROP_HANDLES.map((handle) => (
          <span
            key={handle}
            className={classes.handle}
            data-crop-handle={handle}
            data-handle={handle}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
