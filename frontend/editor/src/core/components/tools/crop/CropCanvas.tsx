import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import type { Rectangle } from "@app/utils/cropCoordinates";
import {
  MM_PER_POINT,
  clampPageRect,
  displayRectToPage,
  getDisplaySize,
  pageRectToDisplay,
  type CropPageGeometry,
} from "@app/utils/cropPageGeometry";
import {
  CROP_HANDLES,
  drawRect,
  isCornerHandle,
  moveRect,
  resizeRect,
  type CropHandle,
  type NormalizedRect,
} from "@app/components/tools/crop/cropInteractionMath";
import classes from "@app/components/tools/crop/CropCanvas.module.css";

export type CropUnit = "mm" | "pt";

export interface CropCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

export interface CropCanvasProps {
  imageUrl: string | null;
  geometry: CropPageGeometry;
  cropArea: Rectangle;
  onCropAreaChange: (area: Rectangle) => void;
  /** Display width / height to lock while resizing, or null for freeform. */
  aspectRatio: number | null;
  disabled?: boolean;
  /** Immersive mode: wheel zooms without a modifier and zoom chrome stays visible. */
  expanded?: boolean;
  /** Rule-of-thirds guides while dragging. */
  gridEnabled?: boolean;
  /** Snap moving edges to page edges and centre lines. */
  snapEnabled?: boolean;
  onToggleGrid?: () => void;
  onToggleSnap?: () => void;
  /** Show the floating zoom/grid pill inside the canvas. */
  showToolbar?: boolean;
  onZoomChange?: (zoom: number) => void;
  /** Draw only. The inline preview on touch devices stays read-only and opens the editor instead. */
  readOnly?: boolean;
  onRequestExpand?: () => void;
  unit?: CropUnit;
  ariaLabel: string;
}

type Point = { x: number; y: number };

type Gesture =
  | {
      kind: "draw";
      anchor: Point;
      start: NormalizedRect;
      live: NormalizedRect | null;
    }
  | {
      kind: "move";
      anchor: Point;
      start: NormalizedRect;
      live: NormalizedRect | null;
    }
  | {
      kind: "resize";
      handle: CropHandle;
      start: NormalizedRect;
      live: NormalizedRect | null;
    }
  | { kind: "pan"; anchor: Point; startPan: Point; startZoom: number }
  | {
      kind: "pinch";
      startDistance: number;
      startMid: Point;
      startZoom: number;
      startPan: Point;
      anchor: Point;
    };

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const LOUPE_SIZE = 132;
const SNAP_SCREEN_PX = 7;
const MIN_SCREEN_HANDLE = 64;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

function fitPage(
  viewport: { width: number; height: number },
  page: { width: number; height: number },
  padding: number,
) {
  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);
  if (!page.width || !page.height || !availableWidth || !availableHeight) {
    return { width: 0, height: 0 };
  }
  const ratio = page.width / page.height;
  let width = availableWidth;
  let height = width / ratio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ratio;
  }
  return { width, height };
}

/**
 * Interactive crop surface. Zoom and the page plane are transform-only; the
 * crop chrome is written straight to the DOM on each animation frame so a drag
 * never re-renders React and never drops a frame.
 */
const CropCanvas = forwardRef<CropCanvasHandle, CropCanvasProps>(
  function CropCanvas(
    {
      imageUrl,
      geometry,
      cropArea,
      onCropAreaChange,
      aspectRatio,
      disabled = false,
      expanded = false,
      gridEnabled = true,
      snapEnabled = true,
      onToggleGrid,
      onToggleSnap,
      showToolbar = true,
      onZoomChange,
      readOnly = false,
      onRequestExpand,
      unit = "mm",
      ariaLabel,
    }: CropCanvasProps,
    ref,
  ) {
    const { t } = useTranslation();
    const viewportRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const selectionRef = useRef<HTMLDivElement>(null);
    const shadeLayerRef = useRef<HTMLDivElement>(null);
    const shadeTopRef = useRef<HTMLDivElement>(null);
    const shadeBottomRef = useRef<HTMLDivElement>(null);
    const shadeLeftRef = useRef<HTMLDivElement>(null);
    const shadeRightRef = useRef<HTMLDivElement>(null);
    const badgeRef = useRef<HTMLSpanElement>(null);
    const widthChipRef = useRef<HTMLSpanElement>(null);
    const heightChipRef = useRef<HTMLSpanElement>(null);
    const guideXRef = useRef<HTMLDivElement>(null);
    const guideYRef = useRef<HTMLDivElement>(null);
    const loupeRef = useRef<HTMLDivElement>(null);

    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [interacting, setInteracting] = useState(false);

    const gestureRef = useRef<Gesture | null>(null);
    const pendingRef = useRef<Gesture | null>(null);
    const pointersRef = useRef(new Map<number, Point>());
    const frameRef = useRef<number | null>(null);
    const latestPointRef = useRef<Point | null>(null);

    const displaySize = useMemo(() => getDisplaySize(geometry), [geometry]);
    const displayRect = useMemo(
      () => pageRectToDisplay(cropArea, geometry),
      [cropArea, geometry],
    );
    const normalized = useMemo<NormalizedRect>(() => {
      const x = displaySize.width
        ? clamp(displayRect.x / displaySize.width, 0, 1)
        : 0;
      const y = displaySize.height
        ? clamp(displayRect.y / displaySize.height, 0, 1)
        : 0;
      return {
        x,
        y,
        width: displaySize.width
          ? clamp(displayRect.width / displaySize.width, 0, 1 - x)
          : 1,
        height: displaySize.height
          ? clamp(displayRect.height / displaySize.height, 0, 1 - y)
          : 1,
      };
    }, [displayRect, displaySize]);
    const minSize = useMemo(
      () => ({
        x: displaySize.width ? 4 / displaySize.width : 0.01,
        y: displaySize.height ? 4 / displaySize.height : 0.01,
      }),
      [displaySize],
    );

    const fit = useMemo(
      () => fitPage(viewport, displaySize, expanded ? 24 : 18),
      [viewport, displaySize, expanded],
    );

    const pageWidth = fit.width * zoom;
    const pageHeight = fit.height * zoom;
    const pageLeft = (viewport.width - pageWidth) / 2 + pan.x;
    const pageTop = (viewport.height - pageHeight) / 2 + pan.y;

    const stateRef = useRef({
      viewport,
      fit,
      zoom,
      pan,
      pageLeft,
      pageTop,
      pageWidth,
      pageHeight,
      normalized,
      minSize,
      aspectRatio,
      snapEnabled,
      unit,
      imageUrl,
      displaySize,
    });
    stateRef.current = {
      viewport,
      fit,
      zoom,
      pan,
      pageLeft,
      pageTop,
      pageWidth,
      pageHeight,
      normalized,
      minSize,
      aspectRatio,
      snapEnabled,
      unit,
      imageUrl,
      displaySize,
    };

    const zoomable = !readOnly && !disabled;

    const safeZoom = useCallback((nextZoom: number, anchor?: Point) => {
      const state = stateRef.current;
      const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (!state.viewport.width || clamped === state.zoom) return;
      const anchorPoint = anchor ?? {
        x: state.viewport.width / 2,
        y: state.viewport.height / 2,
      };
      const localX = (anchorPoint.x - state.pageLeft) / state.zoom;
      const localY = (anchorPoint.y - state.pageTop) / state.zoom;
      const nextLeft = anchorPoint.x - localX * clamped;
      const nextTop = anchorPoint.y - localY * clamped;
      const baseLeft = (state.viewport.width - state.fit.width * clamped) / 2;
      const baseTop = (state.viewport.height - state.fit.height * clamped) / 2;
      const maxPanX = Math.max(
        0,
        (state.fit.width * clamped - state.viewport.width) / 2,
      );
      const maxPanY = Math.max(
        0,
        (state.fit.height * clamped - state.viewport.height) / 2,
      );
      setZoom(clamped);
      setPan({
        x: clamp(nextLeft - baseLeft, -maxPanX, maxPanX),
        y: clamp(nextTop - baseTop, -maxPanY, maxPanY),
      });
    }, []);

    const resetZoom = useCallback(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }, []);

    // Writes zoom/pan straight to the stage, so panning never goes through React.
    const writeStage = useCallback((zoomValue: number, panValue: Point) => {
      const state = stateRef.current;
      const pageWidthValue = state.fit.width * zoomValue;
      const pageHeightValue = state.fit.height * zoomValue;
      const left = (state.viewport.width - pageWidthValue) / 2 + panValue.x;
      const top = (state.viewport.height - pageHeightValue) / 2 + panValue.y;
      const stage = stageRef.current;
      if (stage) {
        stage.style.width = `${state.fit.width}px`;
        stage.style.height = `${state.fit.height}px`;
        stage.style.transform = `translate(${left}px, ${top}px) scale(${zoomValue})`;
      }
      state.zoom = zoomValue;
      state.pan = panValue;
      state.pageWidth = pageWidthValue;
      state.pageHeight = pageHeightValue;
      state.pageLeft = left;
      state.pageTop = top;
    }, []);

    useEffect(() => {
      onZoomChange?.(zoom);
    }, [zoom, onZoomChange]);

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => safeZoom(stateRef.current.zoom * 1.25),
        zoomOut: () => safeZoom(stateRef.current.zoom / 1.25),
        fit: resetZoom,
      }),
      [resetZoom, safeZoom],
    );

    // A new page invalidates both the fit and the zoom.
    useEffect(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }, [geometry]);

    useEffect(() => {
      const element = viewportRef.current;
      if (!element) return;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        setViewport((previous) =>
          Math.abs(previous.width - width) < 0.5 &&
          Math.abs(previous.height - height) < 0.5
            ? previous
            : { width, height },
        );
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    // Keep pan inside the page when the available space changes.
    useEffect(() => {
      setPan((previous) => {
        const maxPanX = Math.max(0, (fit.width * zoom - viewport.width) / 2);
        const maxPanY = Math.max(0, (fit.height * zoom - viewport.height) / 2);
        const nextX = clamp(previous.x, -maxPanX, maxPanX);
        const nextY = clamp(previous.y, -maxPanY, maxPanY);
        return nextX === previous.x && nextY === previous.y
          ? previous
          : { x: nextX, y: nextY };
      });
    }, [fit.width, fit.height, viewport.width, viewport.height, zoom]);

    const formatDimension = useCallback(
      (points: number) => {
        const value = unit === "pt" ? points : points * MM_PER_POINT;
        return value.toFixed(value >= 10 ? 0 : 1);
      },
      [unit],
    );

    const writeSelection = useCallback(
      (rect: NormalizedRect, pointer?: Point) => {
        const state = stateRef.current;
        const left = state.pageLeft + rect.x * state.pageWidth;
        const top = state.pageTop + rect.y * state.pageHeight;
        const width = Math.max(0, rect.width * state.pageWidth);
        const height = Math.max(0, rect.height * state.pageHeight);

        const selection = selectionRef.current;
        if (selection) {
          selection.style.left = `${left}px`;
          selection.style.top = `${top}px`;
          selection.style.width = `${width}px`;
          selection.style.height = `${height}px`;
          selection.dataset.compact =
            width < MIN_SCREEN_HANDLE || height < MIN_SCREEN_HANDLE
              ? "true"
              : "false";
        }

        const layer = shadeLayerRef.current;
        if (layer) {
          layer.style.left = `${state.pageLeft}px`;
          layer.style.top = `${state.pageTop}px`;
          layer.style.width = `${Math.max(0, state.pageWidth)}px`;
          layer.style.height = `${Math.max(0, state.pageHeight)}px`;
        }

        const localLeft = rect.x * state.pageWidth;
        const localTop = rect.y * state.pageHeight;
        const localWidth = Math.max(0, rect.width * state.pageWidth);
        const localHeight = Math.max(0, rect.height * state.pageHeight);
        const localRight = localLeft + localWidth;
        const localBottom = localTop + localHeight;
        const setBox = (
          element: HTMLDivElement | null,
          boxLeft: number,
          boxTop: number,
          boxWidth: number,
          boxHeight: number,
        ) => {
          if (!element) return;
          element.style.left = `${boxLeft}px`;
          element.style.top = `${boxTop}px`;
          element.style.width = `${Math.max(0, boxWidth)}px`;
          element.style.height = `${Math.max(0, boxHeight)}px`;
        };
        setBox(shadeTopRef.current, 0, 0, state.pageWidth, localTop);
        setBox(
          shadeBottomRef.current,
          0,
          localBottom,
          state.pageWidth,
          state.pageHeight - localBottom,
        );
        setBox(shadeLeftRef.current, 0, localTop, localLeft, localHeight);
        setBox(
          shadeRightRef.current,
          localRight,
          localTop,
          state.pageWidth - localRight,
          localHeight,
        );

        const right = left + width;
        const nearlyFull = rect.width > 0.999 && rect.height > 0.999;
        const widthChip = widthChipRef.current;
        if (widthChip) {
          const inside = top < 34;
          widthChip.textContent = `${formatDimension(
            rect.width * state.displaySize.width,
          )} ${unit}`;
          widthChip.style.left = `${left + width / 2}px`;
          widthChip.style.top = `${inside ? top + 14 : top - 20}px`;
          widthChip.dataset.inside = inside ? "true" : "false";
          widthChip.dataset.visible =
            !nearlyFull && width > 90 && height > 40 ? "true" : "false";
        }
        const heightChip = heightChipRef.current;
        if (heightChip) {
          const inside = right + 84 >= state.viewport.width;
          heightChip.textContent = `${formatDimension(
            rect.height * state.displaySize.height,
          )} ${unit}`;
          heightChip.style.left = `${inside ? right - 8 : right + 8}px`;
          heightChip.style.top = `${top + height / 2}px`;
          heightChip.style.transform = inside
            ? "translate(-100%, -50%)"
            : "translate(-50%, -50%)";
          heightChip.dataset.inside = inside ? "true" : "false";
          heightChip.dataset.visible =
            !nearlyFull && height > 70 && width > 40 ? "true" : "false";
        }

        if (badgeRef.current) {
          badgeRef.current.textContent = t("crop.canvas.dimensions", {
            width: formatDimension(rect.width * state.displaySize.width),
            height: formatDimension(rect.height * state.displaySize.height),
            unit,
            defaultValue: "{{width}} × {{height}} {{unit}}",
          });
        }

        if (pointer && state.imageUrl) {
          const loupe = loupeRef.current;
          if (loupe) {
            const loupeScale = Math.max(1.5, 2.4 / Math.sqrt(state.zoom));
            const backgroundWidth = state.pageWidth * loupeScale;
            const backgroundHeight = state.pageHeight * loupeScale;
            const pointerX = clamp(
              (pointer.x - state.pageLeft) / Math.max(state.pageWidth, 0.0001),
              0,
              1,
            );
            const pointerY = clamp(
              (pointer.y - state.pageTop) / Math.max(state.pageHeight, 0.0001),
              0,
              1,
            );
            loupe.style.backgroundImage = `url("${state.imageUrl}")`;
            loupe.style.backgroundSize = `${backgroundWidth}px ${backgroundHeight}px`;
            loupe.style.backgroundPosition = `${
              LOUPE_SIZE / 2 - pointerX * backgroundWidth
            }px ${LOUPE_SIZE / 2 - pointerY * backgroundHeight}px`;
            const offset = 26;
            const placeLeft =
              pointer.x + offset + LOUPE_SIZE > state.viewport.width;
            const placeAbove = pointer.y - offset - LOUPE_SIZE < 0;
            loupe.style.left = `${
              placeLeft ? pointer.x - offset - LOUPE_SIZE : pointer.x + offset
            }px`;
            loupe.style.top = `${
              placeAbove ? pointer.y + offset : pointer.y - offset - LOUPE_SIZE
            }px`;
            loupe.dataset.visible = "true";
          }
        }
      },
      [formatDimension, t, unit],
    );

    const hideLoupe = useCallback(() => {
      if (loupeRef.current) loupeRef.current.dataset.visible = "false";
    }, []);

    const hideGuides = useCallback(() => {
      for (const ref of [guideXRef, guideYRef]) {
        if (ref.current) ref.current.dataset.visible = "false";
      }
    }, []);

    // Paint from props whenever nothing is being dragged.
    useLayoutEffect(() => {
      if (gestureRef.current) return;
      writeSelection(normalized);
    }, [normalized, writeSelection, viewport, zoom, pan]);

    useLayoutEffect(() => {
      writeStage(zoom, pan);
      writeSelection(normalized);
    }, [
      writeStage,
      writeSelection,
      normalized,
      zoom,
      pan,
      fit.width,
      fit.height,
      viewport,
    ]);

    const commit = useCallback(
      (rect: NormalizedRect) => {
        const size = getDisplaySize(geometry);
        const pageRect = displayRectToPage(
          {
            x: rect.x * size.width,
            y: rect.y * size.height,
            width: rect.width * size.width,
            height: rect.height * size.height,
          },
          geometry,
        );
        onCropAreaChange(clampPageRect(pageRect, geometry));
      },
      [geometry, onCropAreaChange],
    );

    const pointToNormalized = useCallback((point: Point): Point => {
      const state = stateRef.current;
      return {
        x: clamp(
          (point.x - state.pageLeft) / Math.max(state.pageWidth, 0.0001),
          0,
          1,
        ),
        y: clamp(
          (point.y - state.pageTop) / Math.max(state.pageHeight, 0.0001),
          0,
          1,
        ),
      };
    }, []);

    const snapCoordinate = useCallback((value: number): number => {
      const state = stateRef.current;
      const threshold = SNAP_SCREEN_PX / Math.max(state.pageWidth, 1);
      for (const candidate of [0, 0.5, 1]) {
        if (Math.abs(value - candidate) <= threshold) return candidate;
      }
      return value;
    }, []);

    const showGuide = useCallback((key: "x" | "y", value: number) => {
      const state = stateRef.current;
      if (key === "x") {
        const element = guideXRef.current;
        if (!element) return;
        element.style.left = `${state.pageLeft + value * state.pageWidth}px`;
        element.dataset.visible = "true";
      } else {
        const element = guideYRef.current;
        if (!element) return;
        element.style.top = `${state.pageTop + value * state.pageHeight}px`;
        element.dataset.visible = "true";
      }
    }, []);

    const applyGesture = useCallback(
      (point: Point) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const state = stateRef.current;
        const normalizedPoint = pointToNormalized(point);

        switch (gesture.kind) {
          case "draw": {
            let target = normalizedPoint;
            if (!state.aspectRatio && state.snapEnabled) {
              hideGuides();
              const snappedX = snapCoordinate(target.x);
              const snappedY = snapCoordinate(target.y);
              if (snappedX !== target.x) showGuide("x", snappedX);
              if (snappedY !== target.y) showGuide("y", snappedY);
              target = { x: snappedX, y: snappedY };
            }
            const rect = drawRect(
              gesture.anchor,
              target,
              state.aspectRatio,
              state.minSize,
            );
            gesture.live = rect;
            writeSelection(rect, point);
            break;
          }
          case "move": {
            const deltaX = normalizedPoint.x - gesture.anchor.x;
            const deltaY = normalizedPoint.y - gesture.anchor.y;
            const rect = moveRect(gesture.start, deltaX, deltaY);
            gesture.live = rect;
            writeSelection(rect);
            break;
          }
          case "resize": {
            let target = normalizedPoint;
            if (
              !state.aspectRatio &&
              state.snapEnabled &&
              isCornerHandle(gesture.handle)
            ) {
              hideGuides();
              const snappedX = snapCoordinate(target.x);
              const snappedY = snapCoordinate(target.y);
              if (snappedX !== target.x) showGuide("x", snappedX);
              if (snappedY !== target.y) showGuide("y", snappedY);
              target = { x: snappedX, y: snappedY };
            }
            const rect = resizeRect(
              gesture.handle,
              target,
              gesture.start,
              state.aspectRatio,
              state.minSize,
            );
            gesture.live = rect;
            writeSelection(rect, point);
            break;
          }
          case "pan": {
            const maxPanX = Math.max(
              0,
              (state.fit.width * gesture.startZoom - state.viewport.width) / 2,
            );
            const maxPanY = Math.max(
              0,
              (state.fit.height * gesture.startZoom - state.viewport.height) /
                2,
            );
            writeStage(state.zoom, {
              x: clamp(
                gesture.startPan.x + (point.x - gesture.anchor.x),
                -maxPanX,
                maxPanX,
              ),
              y: clamp(
                gesture.startPan.y + (point.y - gesture.anchor.y),
                -maxPanY,
                maxPanY,
              ),
            });
            writeSelection(state.normalized);
            break;
          }
          case "pinch":
            break;
        }
      },
      [
        hideGuides,
        pointToNormalized,
        showGuide,
        snapCoordinate,
        writeSelection,
        writeStage,
      ],
    );

    const scheduleFrame = useCallback(
      (point: Point) => {
        latestPointRef.current = point;
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          const next = latestPointRef.current;
          if (next) applyGesture(next);
        });
      },
      [applyGesture],
    );

    const finishGesture = useCallback(() => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const gesture = gestureRef.current;
      gestureRef.current = null;
      pendingRef.current = null;
      hideLoupe();
      hideGuides();
      setInteracting(false);
      const viewportElement = viewportRef.current;
      if (viewportElement) delete viewportElement.dataset.active;
      if (gesture?.kind === "pan") {
        setPan({ ...stateRef.current.pan });
      }
      if (
        gesture &&
        (gesture.kind === "draw" ||
          gesture.kind === "move" ||
          gesture.kind === "resize")
      ) {
        const live = gesture.live;
        if (live) commit(live);
        else writeSelection(stateRef.current.normalized);
      }
    }, [commit, hideGuides, hideLoupe, writeSelection]);

    const startPinch = useCallback(() => {
      const [a, b] = [...pointersRef.current.values()];
      if (!a || !b) return;
      const state = stateRef.current;
      const mid = midpoint(a, b);
      gestureRef.current = {
        kind: "pinch",
        startDistance: Math.max(distance(a, b), 1),
        startMid: mid,
        startZoom: state.zoom,
        startPan: state.pan,
        anchor: {
          x: (mid.x - state.pageLeft) / Math.max(state.zoom, 0.0001),
          y: (mid.y - state.pageTop) / Math.max(state.zoom, 0.0001),
        },
      };
    }, []);

    const localPoint = useCallback((event: ReactPointerEvent): Point => {
      const rect = viewportRef.current?.getBoundingClientRect();
      return {
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
      };
    }, []);

    const handlePointerDown = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (
          !zoomable ||
          (event.pointerType === "mouse" && event.button !== 0)
        ) {
          return;
        }
        const point = localPoint(event);
        pointersRef.current.set(event.pointerId, point);
        viewportRef.current?.setPointerCapture?.(event.pointerId);

        if (pointersRef.current.size === 2) {
          pendingRef.current = null;
          startPinch();
          setInteracting(true);
          return;
        }
        if (pointersRef.current.size > 2) return;

        const pending = pendingRef.current;
        pendingRef.current = null;
        const state = stateRef.current;
        const normalizedPoint = pointToNormalized(point);
        const insidePage =
          normalizedPoint.x > 0 &&
          normalizedPoint.x < 1 &&
          normalizedPoint.y > 0 &&
          normalizedPoint.y < 1;

        if (pending) {
          gestureRef.current = pending;
        } else if (insidePage) {
          gestureRef.current = {
            kind: "draw",
            anchor: normalizedPoint,
            start: state.normalized,
            live: null,
          };
        } else if (state.zoom > 1) {
          gestureRef.current = {
            kind: "pan",
            anchor: point,
            startPan: state.pan,
            startZoom: state.zoom,
          };
        } else {
          return;
        }

        setInteracting(true);
        const viewportElement = viewportRef.current;
        if (viewportElement) {
          viewportElement.dataset.active = "true";
          viewportElement.focus({ preventScroll: true });
        }
        event.preventDefault();
      },
      [localPoint, pointToNormalized, startPinch, zoomable],
    );

    const handlePointerMove = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!pointersRef.current.has(event.pointerId)) return;
        const point = localPoint(event);
        pointersRef.current.set(event.pointerId, point);

        if (pointersRef.current.size === 2) {
          const gesture = gestureRef.current;
          if (!gesture || gesture.kind !== "pinch") return;
          const [a, b] = [...pointersRef.current.values()];
          if (!a || !b) return;
          const state = stateRef.current;
          const nextZoom = clamp(
            gesture.startZoom *
              (distance(a, b) / Math.max(gesture.startDistance, 1)),
            MIN_ZOOM,
            MAX_ZOOM,
          );
          const mid = midpoint(a, b);
          const nextLeft = mid.x - gesture.anchor.x * nextZoom;
          const nextTop = mid.y - gesture.anchor.y * nextZoom;
          const baseLeft =
            (state.viewport.width - state.fit.width * nextZoom) / 2;
          const baseTop =
            (state.viewport.height - state.fit.height * nextZoom) / 2;
          const maxPanX = Math.max(
            0,
            (state.fit.width * nextZoom - state.viewport.width) / 2,
          );
          const maxPanY = Math.max(
            0,
            (state.fit.height * nextZoom - state.viewport.height) / 2,
          );
          const nextPan = {
            x: clamp(nextLeft - baseLeft, -maxPanX, maxPanX),
            y: clamp(nextTop - baseTop, -maxPanY, maxPanY),
          };
          writeStage(nextZoom, nextPan);
          writeSelection(state.normalized);
          onZoomChange?.(nextZoom);
          return;
        }

        scheduleFrame(point);
      },
      [localPoint, onZoomChange, scheduleFrame, writeSelection, writeStage],
    );

    const handlePointerUp = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        pointersRef.current.delete(event.pointerId);
        if (pointersRef.current.size === 0) {
          finishGesture();
        } else if (pointersRef.current.size === 1) {
          const gesture = gestureRef.current;
          if (gesture?.kind === "pinch") {
            gestureRef.current = null;
            setInteracting(false);
            setZoom(stateRef.current.zoom);
            setPan({ ...stateRef.current.pan });
            const remaining = [...pointersRef.current.values()][0];
            if (remaining) {
              // Continue as a pan from the surviving finger.
              gestureRef.current = {
                kind: "pan",
                anchor: remaining,
                startPan: stateRef.current.pan,
                startZoom: stateRef.current.zoom,
              };
            }
          }
        }
      },
      [finishGesture],
    );

    const handleKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (disabled || readOnly) return;
        const state = stateRef.current;
        const step = (event.shiftKey ? 10 : 1) / Math.max(state.pageWidth, 1);
        const resize = event.altKey;
        let rect: NormalizedRect | null = null;

        switch (event.key) {
          case "ArrowLeft":
            rect = resize
              ? {
                  ...state.normalized,
                  width: Math.max(
                    state.minSize.x,
                    state.normalized.width - step,
                  ),
                }
              : moveRect(state.normalized, -step, 0);
            break;
          case "ArrowRight":
            rect = resize
              ? {
                  ...state.normalized,
                  width: Math.min(
                    1 - state.normalized.x,
                    state.normalized.width + step,
                  ),
                }
              : moveRect(state.normalized, step, 0);
            break;
          case "ArrowUp":
            rect = resize
              ? {
                  ...state.normalized,
                  height: Math.max(
                    state.minSize.y,
                    state.normalized.height - step,
                  ),
                }
              : moveRect(state.normalized, 0, -step);
            break;
          case "ArrowDown":
            rect = resize
              ? {
                  ...state.normalized,
                  height: Math.min(
                    1 - state.normalized.y,
                    state.normalized.height + step,
                  ),
                }
              : moveRect(state.normalized, 0, step);
            break;
          case "+":
          case "=":
            safeZoom(state.zoom * 1.25);
            event.preventDefault();
            return;
          case "-":
          case "_":
            safeZoom(state.zoom / 1.25);
            event.preventDefault();
            return;
          case "0":
            resetZoom();
            event.preventDefault();
            return;
          case "Escape":
            if (gestureRef.current) {
              event.stopPropagation();
              finishGesture();
            }
            return;
          default:
            return;
        }

        event.preventDefault();
        writeSelection(rect);
        commit(rect);
      },
      [commit, disabled, finishGesture, resetZoom, safeZoom, writeSelection],
    );

    // Wheel zoom: always available in the expanded editor, modifier-only inline
    // so the tool panel keeps scrolling normally.
    useEffect(() => {
      const element = viewportRef.current;
      if (!element || !zoomable) return;
      let frame: number | null = null;
      let pending: { factor: number; anchor: Point } | null = null;
      const onWheel = (event: WheelEvent) => {
        const modifier = event.ctrlKey || event.metaKey || event.altKey;
        if (!expanded && !modifier) return;
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        const anchor = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const factor = Math.exp(-event.deltaY * 0.0015);
        pending = pending
          ? { factor: pending.factor * factor, anchor }
          : { factor, anchor };
        if (frame !== null) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          const next = pending;
          pending = null;
          if (next) safeZoom(stateRef.current.zoom * next.factor, next.anchor);
        });
      };
      element.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        element.removeEventListener("wheel", onWheel);
        if (frame !== null) cancelAnimationFrame(frame);
      };
    }, [expanded, safeZoom, zoomable]);

    const beginMove = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!zoomable) return;
        if (pendingRef.current) return;
        const point = pointToNormalized(localPoint(event));
        pendingRef.current = {
          kind: "move",
          anchor: point,
          start: stateRef.current.normalized,
          live: null,
        };
      },
      [localPoint, pointToNormalized, zoomable],
    );

    const beginResize = useCallback(
      (handle: CropHandle) => (_event: ReactPointerEvent<HTMLDivElement>) => {
        if (!zoomable) return;
        pendingRef.current = {
          kind: "resize",
          handle,
          start: stateRef.current.normalized,
          live: null,
        };
      },
      [zoomable],
    );

    const zoomPercent = Math.round(zoom * 100);

    return (
      <div
        ref={viewportRef}
        className={classes.viewport}
        data-testid="crop-canvas"
        data-interactive={zoomable && !readOnly ? "true" : "false"}
        data-readonly={readOnly ? "true" : "false"}
        data-grid-enabled={gridEnabled ? "true" : "false"}
        data-hint={!imageUrl && !readOnly ? "true" : "false"}
        style={{ cursor: zoom > 1 && !interacting ? "grab" : undefined }}
        tabIndex={disabled || readOnly ? -1 : 0}
        role="group"
        aria-label={ariaLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDoubleClick={zoom > 1 ? resetZoom : undefined}
      >
        <div ref={stageRef} className={classes.stage}>
          {imageUrl ? (
            <img
              className={classes.pageImage}
              src={imageUrl}
              alt=""
              draggable={false}
              decoding="async"
            />
          ) : (
            <div className={classes.pagePlaceholder} />
          )}
        </div>

        <div className={classes.overlay}>
          <span
            ref={widthChipRef}
            className={classes.dimChip}
            data-visible="false"
          />
          <span
            ref={heightChipRef}
            className={`${classes.dimChip} ${classes.dimChipHeight}`}
            data-visible="false"
          />

          <div ref={shadeLayerRef} className={classes.shadeLayer}>
            <div ref={shadeTopRef} className={classes.shade} />
            <div ref={shadeBottomRef} className={classes.shade} />
            <div ref={shadeLeftRef} className={classes.shade} />
            <div ref={shadeRightRef} className={classes.shade} />
          </div>

          <div className={classes.guide} ref={guideXRef} data-visible="false" />
          <div
            className={`${classes.guide} ${classes.guideY}`}
            ref={guideYRef}
            data-visible="false"
          />

          <div
            ref={selectionRef}
            className={classes.selection}
            data-testid="crop-selection"
            data-compact="false"
            onPointerDown={beginMove}
            role="presentation"
          >
            <div className={classes.selectionGrid} />
            {CROP_HANDLES.map((handle) => (
              <div
                key={handle}
                className={classes.handle}
                data-handle={handle}
                onPointerDown={beginResize(handle)}
                style={handlePosition(handle)}
              />
            ))}
          </div>
        </div>

        <div ref={loupeRef} className={classes.loupe} data-visible="false" />

        {!imageUrl && (
          <div className={classes.hint}>
            {t("crop.canvas.loading", "Loading page preview…")}
          </div>
        )}

        <div className={classes.badge}>
          <Icon name="ruler" size={12} />
          <span ref={badgeRef} data-testid="crop-size" />
        </div>

        {zoomable && !readOnly && expanded && showToolbar && (
          <div
            className={classes.toolbar}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {onToggleGrid && (
              <ActionIcon
                variant={gridEnabled ? "secondary" : "quiet"}
                accent="neutral"
                size="sm"
                aria-label={t("crop.canvas.toggleGrid", "Toggle grid")}
                aria-pressed={gridEnabled}
                title={t("crop.canvas.toggleGrid", "Toggle grid")}
                onClick={onToggleGrid}
              >
                <Icon name="layout-grid" size="0.875rem" />
              </ActionIcon>
            )}
            {onToggleSnap && (
              <ActionIcon
                variant={snapEnabled ? "secondary" : "quiet"}
                accent="neutral"
                size="sm"
                aria-label={t("crop.canvas.toggleSnap", "Toggle snapping")}
                aria-pressed={snapEnabled}
                title={t("crop.canvas.toggleSnap", "Toggle snapping")}
                onClick={onToggleSnap}
              >
                <Icon name="magnet" size="0.875rem" />
              </ActionIcon>
            )}
            <ActionIcon
              variant="quiet"
              accent="neutral"
              size="sm"
              aria-label={t("crop.canvas.zoomOut", "Zoom out")}
              onClick={() => safeZoom(zoom / 1.25)}
              disabled={zoom <= MIN_ZOOM}
            >
              <Icon name="zoom-out" size="1rem" />
            </ActionIcon>
            <button
              type="button"
              className={classes.zoomLabel}
              onClick={resetZoom}
              aria-label={t("crop.canvas.fitToPage", "Fit to page")}
              title={t("crop.canvas.fitToPage", "Fit to page")}
            >
              {zoomPercent}%
            </button>
            <ActionIcon
              variant="quiet"
              accent="neutral"
              size="sm"
              aria-label={t("crop.canvas.zoomIn", "Zoom in")}
              onClick={() => safeZoom(zoom * 1.25)}
              disabled={zoom >= MAX_ZOOM}
            >
              <Icon name="zoom-in" size="1rem" />
            </ActionIcon>
          </div>
        )}

        {readOnly && onRequestExpand && (
          <button
            type="button"
            className={classes.tapTarget}
            onClick={onRequestExpand}
            aria-label={t("crop.canvas.openEditor", "Open crop editor")}
          >
            <span className={classes.tapHint}>
              <Icon name="fullscreen" size={14} />
              {t("crop.canvas.edit", "Edit crop area")}
            </span>
          </button>
        )}
      </div>
    );
  },
);

export default CropCanvas;

function handlePosition(handle: CropHandle): {
  left: string;
  top: string;
} {
  const horizontal = handle.includes("w")
    ? "0%"
    : handle.includes("e")
      ? "100%"
      : "50%";
  const vertical = handle.includes("n")
    ? "0%"
    : handle.includes("s")
      ? "100%"
      : "50%";
  return { left: horizontal, top: vertical };
}
