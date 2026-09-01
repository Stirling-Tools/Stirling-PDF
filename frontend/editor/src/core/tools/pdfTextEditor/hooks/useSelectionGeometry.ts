import { useMemo } from "react";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { ReflowWrapCommand } from "@app/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/commands/SetImageTransformCommand";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { EditorViewState } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { PageRect, SelectionState } from "@app/tools/pdfTextEditor/types";

export interface SingleSelectionGeometry {
  bounds: PageRect;
  setX: (next: number) => void;
  setY: (next: number) => void;
  setWidth: (next: number) => void;
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
export function useSelectionGeometry(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): SelectionGeometry {
  return useMemo(() => {
    const runId = selection.runIds[0];
    const imageId = selection.imageIds[0];
    const total = selection.runIds.length + selection.imageIds.length;
    if (total !== 1) return { single: null };

    if (runId) {
      for (const page of state.pages) {
        const run = page.runs.find((r) => r.id === runId);
        if (!run) continue;
        const pageIndex = page.pageIndex;
        const bounds = run.bounds;
        return {
          single: {
            bounds,
            setX: (next) =>
              store.dispatch(
                new MoveTextRunCommand({
                  pageIndex,
                  runId,
                  dx: next - bounds.x,
                  dy: 0,
                }),
              ),
            setY: (next) =>
              store.dispatch(
                new MoveTextRunCommand({
                  pageIndex,
                  runId,
                  dx: 0,
                  dy: next - bounds.y,
                }),
              ),
            // Narrowing a run is exactly the wrap gesture, so it reuses the
            // same command the canvas resize handle drives.
            setWidth: (next) =>
              store.dispatch(
                new ReflowWrapCommand({
                  pageIndex,
                  runId,
                  maxWidthPt: Math.max(1, next),
                }),
              ),
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
        const bounds = img.bounds;
        const set = (patch: Partial<PageRect>) =>
          store.dispatch(
            new SetImageTransformCommand({
              pageIndex,
              imageId,
              nextBounds: { ...bounds, ...patch },
            }),
          );
        return {
          single: {
            bounds,
            setX: (next) => set({ x: next }),
            setY: (next) => set({ y: next }),
            setWidth: (next) => set({ width: Math.max(1, next) }),
            setHeight: (next) => set({ height: Math.max(1, next) }),
          },
        };
      }
    }
    return { single: null };
  }, [store, state.pages, selection]);
}
