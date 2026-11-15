import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  PageRect,
  SelectionState,
} from "@editor/tools/pdfTextEditor/types";

function viewWith(run: PageRect, image: PageRect): EditorViewState {
  return {
    pages: [
      {
        pageIndex: 0,
        runs: [{ id: "r1", bounds: run }],
        images: [{ id: "i1", bounds: image }],
      },
    ],
  } as unknown as EditorViewState;
}

function selected(ids: Partial<SelectionState>): SelectionState {
  return {
    runIds: [],
    imageIds: [],
    shapeIds: [],
    caret: null,
    textRange: null,
    ...ids,
  };
}

const rect = (x: number, y: number): PageRect => ({
  x,
  y,
  width: 50,
  height: 10,
});

function geometryOverStaleSnapshot(selection: SelectionState) {
  const stale = viewWith(rect(0, 0), rect(0, 0));
  const live = viewWith(rect(10, 5), { x: 10, y: 5, width: 80, height: 40 });
  const dispatch = vi.fn();
  const store = {
    getState: () => live,
    dispatch,
  } as unknown as EditorStore;
  const { result } = renderHook(() =>
    useSelectionGeometry(store, stale, selection),
  );
  return { single: result.current.single!, dispatch };
}

describe("useSelectionGeometry setters", () => {
  it("move a text run from where it is now, not where the panel last drew it", () => {
    const { single, dispatch } = geometryOverStaleSnapshot(
      selected({ runIds: ["r1"] }),
    );
    single.setX(20);
    single.setY(20);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ dx: 10, dy: 0 });
    expect(dispatch.mock.calls[1][0]).toMatchObject({ dx: 0, dy: 15 });
  });

  it("keep an image's other edges where they are now", () => {
    const { single, dispatch } = geometryOverStaleSnapshot(
      selected({ imageIds: ["i1"] }),
    );
    single.setX(20);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      nextBounds: { x: 20, y: 5, width: 80, height: 40 },
    });
  });
});
