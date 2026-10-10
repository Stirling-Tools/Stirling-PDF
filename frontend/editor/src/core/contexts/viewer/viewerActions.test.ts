import { describe, expect, it, vi } from "vitest";
import { createViewerActions } from "@app/contexts/viewer/viewerActions";
import type { ScrollState } from "@app/contexts/viewer/viewerBridges";

function makeActions(currentZoom: number, requestZoom = vi.fn()) {
  const actions = createViewerActions({
    registry: {
      current: { zoom: { api: { requestZoom } } },
    } as never,
    getScrollState: () => ({}) as ScrollState,
    getZoomState: () => ({ currentZoom, zoomPercent: currentZoom * 100 }),
    triggerImmediateZoomUpdate: vi.fn(),
  });
  return { actions, requestZoom };
}

describe("viewerActions — button zoom", () => {
  it("zooms in by a proportional step in one commit", () => {
    const { actions, requestZoom } = makeActions(1);
    actions.zoomActions.zoomIn();
    expect(requestZoom).toHaveBeenCalledExactlyOnceWith(1.25);
  });

  it("zooms out by the same factor", () => {
    const { actions, requestZoom } = makeActions(2);
    actions.zoomActions.zoomOut();
    expect(requestZoom).toHaveBeenCalledExactlyOnceWith(1.6);
  });

  it("clamps to the gesture range instead of overshooting", () => {
    const { actions, requestZoom } = makeActions(4.5);
    actions.zoomActions.zoomIn();
    expect(requestZoom).toHaveBeenCalledExactlyOnceWith(5);
  });

  it("does not scale below the minimum zoom", () => {
    const { actions, requestZoom } = makeActions(0.21);
    actions.zoomActions.zoomOut();
    expect(requestZoom).toHaveBeenCalledExactlyOnceWith(0.2);
  });

  it("falls back to 1x when the bridge has no usable level", () => {
    const { actions, requestZoom } = makeActions(Number.NaN);
    actions.zoomActions.zoomIn();
    expect(requestZoom).toHaveBeenCalledExactlyOnceWith(1.25);
  });

  it("no-ops without a zoom api", () => {
    const actions = createViewerActions({
      registry: { current: {} } as never,
      getScrollState: () => ({}) as ScrollState,
      getZoomState: () => ({ currentZoom: 1, zoomPercent: 100 }),
      triggerImmediateZoomUpdate: vi.fn(),
    });
    expect(() => actions.zoomActions.zoomIn()).not.toThrow();
  });
});
