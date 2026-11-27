import { useMemo } from "react";
import {
  DisplayTransform,
  type DisplayTransformData,
} from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { transformRectAABB } from "@editor/tools/pdfTextEditor/model/affine";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import {
  canResizeRun,
  resizeRunCommand,
} from "@editor/tools/pdfTextEditor/commands/resizeRun";
import { SetImageTransformCommand } from "@editor/tools/pdfTextEditor/commands/SetImageTransformCommand";
import {
  imageBoundsForVisible,
  visibleImageBounds,
} from "@editor/tools/pdfTextEditor/util/imageClip";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  ImageObjectSnapshot,
  PageRect,
  SelectionState,
} from "@editor/tools/pdfTextEditor/types";

export interface SingleSelectionGeometry {
  bounds: PageRect;
  display: DisplayTransformData;
  setX: (next: number) => void;
  setY: (next: number) => void;
  moveDisplayed: (next: { left?: number; top?: number }) => void;
  setWidth?: (next: number) => void;
  /** Absent for text runs: their height follows the type, not a handle. */
  setHeight?: (next: number) => void;
}

export interface SelectionGeometry {
  /** Null unless exactly one object is selected. */
  single: SingleSelectionGeometry | null;
}

/**
 * Numeric position/size for the inspector, in PDF points.
 *
 * Only meaningful for a single object - the fields would have to invent a
 * value for a mixed selection, so the panel shows a hint instead.
 */
// The panel may draw a deferred snapshot, so setters read bounds from the store when they run.
function liveRun(store: EditorStore, runId: string) {
  for (const page of store.getState().pages) {
    const run = page.runs.find((r) => r.id === runId);
    if (run) return run;
  }
  return null;
}

function liveRunBounds(
  store: EditorStore,
  runId: string,
  fallback: PageRect,
): PageRect {
  return liveRun(store, runId)?.bounds ?? fallback;
}

function shownRunBounds(run: { bounds: PageRect; wrapWidthPt?: number }) {
  return run.wrapWidthPt
    ? { ...run.bounds, width: run.wrapWidthPt }
    : run.bounds;
}

export function displayedTopLeft(
  display: DisplayTransformData,
  bounds: PageRect,
): { left: number; top: number } {
  const shown = transformRectAABB(display, bounds);
  return {
    left: shown.x,
    top: display.displayHeight - (shown.y + shown.height),
  };
}

function displayedMover(
  display: DisplayTransformData,
  liveBounds: () => PageRect,
  setX: (next: number) => void,
  setY: (next: number) => void,
) {
  return (next: { left?: number; top?: number }) => {
    const bounds = liveBounds();
    const transform = DisplayTransform.fromData(display);
    const now = displayedTopLeft(display, bounds);
    const from = transform.invert(now.left, transform.displayHeight - now.top);
    const to = transform.invert(
      next.left ?? now.left,
      transform.displayHeight - (next.top ?? now.top),
    );
    if (Math.abs(to.x - from.x) > 1e-3) setX(bounds.x + to.x - from.x);
    if (Math.abs(to.y - from.y) > 1e-3) setY(bounds.y + to.y - from.y);
  };
}

function liveImage(
  store: EditorStore,
  imageId: string,
  fallback: ImageObjectSnapshot,
): ImageObjectSnapshot {
  for (const page of store.getState().pages) {
    const img = page.images.find((i) => i.id === imageId);
    if (img) return img;
  }
  return fallback;
}

export function useSelectionGeometry(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): SelectionGeometry {
  return useMemo(() => {
    const runId = selection.runIds[0];
    const imageId = selection.imageIds[0];
    const total =
      selection.runIds.length +
      selection.imageIds.length +
      selection.shapeIds.length;
    if (total !== 1) return { single: null };

    if (runId) {
      for (const page of state.pages) {
        const run = page.runs.find((r) => r.id === runId);
        if (!run) continue;
        const pageIndex = page.pageIndex;
        const bounds = shownRunBounds(run);
        const setX = (next: number) =>
          store.dispatch(
            new MoveTextRunCommand({
              pageIndex,
              runId,
              dx: next - liveRunBounds(store, runId, bounds).x,
              dy: 0,
            }),
          );
        const setY = (next: number) =>
          store.dispatch(
            new MoveTextRunCommand({
              pageIndex,
              runId,
              dx: 0,
              dy: next - liveRunBounds(store, runId, bounds).y,
            }),
          );
        return {
          single: {
            bounds,
            display: page.display,
            setX,
            setY,
            moveDisplayed: displayedMover(
              page.display,
              () => {
                const live = liveRun(store, runId);
                return live ? shownRunBounds(live) : bounds;
              },
              setX,
              setY,
            ),
            // Narrowing a run is exactly the wrap gesture, so it reuses the
            // same command the canvas resize handle drives.
            setWidth: canResizeRun(run)
              ? (next) => {
                  const doc = store.document;
                  const cmd =
                    doc && resizeRunCommand(doc, pageIndex, runId, next);
                  if (cmd) store.dispatch(cmd);
                }
              : undefined,
          },
        };
      }
      return { single: null };
    }

    if (imageId) {
      for (const page of state.pages) {
        const img = page.images.find((i) => i.id === imageId);
        if (!img) continue;
        const pageIndex = page.pageIndex;
        const bounds = visibleImageBounds(img);
        const set = (patch: Partial<PageRect>) => {
          const live = liveImage(store, imageId, img);
          store.dispatch(
            new SetImageTransformCommand({
              pageIndex,
              imageId,
              nextBounds: imageBoundsForVisible(live, {
                ...visibleImageBounds(live),
                ...patch,
              }),
            }),
          );
        };
        const setX = (next: number) => set({ x: next });
        const setY = (next: number) => set({ y: next });
        return {
          single: {
            bounds,
            display: page.display,
            setX,
            setY,
            moveDisplayed: displayedMover(
              page.display,
              () => visibleImageBounds(liveImage(store, imageId, img)),
              setX,
              setY,
            ),
            setWidth: (next) => set({ width: Math.max(1, next) }),
            setHeight: (next) => set({ height: Math.max(1, next) }),
          },
        };
      }
    }
    return { single: null };
  }, [store, state.pages, selection]);
}
