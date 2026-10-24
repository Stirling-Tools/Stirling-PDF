import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useViewerIsPanning } from "@editor/components/viewer/useViewerIsPanning";

let panListener: ((isPanning: boolean) => void) | null = null;
let panningAtMount = false;

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({
    getPanState: () => ({ isPanning: panningAtMount }),
    registerImmediatePanUpdate: (listener: (isPanning: boolean) => void) => {
      panListener = listener;
      return () => {
        panListener = null;
      };
    },
  }),
}));

describe("useViewerIsPanning", () => {
  test("starts from pan mode that was already on", () => {
    panningAtMount = true;
    const { result } = renderHook(() => useViewerIsPanning());
    expect(result.current).toBe(true);
  });

  test("follows later changes", () => {
    panningAtMount = false;
    const { result } = renderHook(() => useViewerIsPanning());
    expect(result.current).toBe(false);
    act(() => panListener?.(true));
    expect(result.current).toBe(true);
  });
});
