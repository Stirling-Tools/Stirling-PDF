import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("viewerActions — animated button zoom", () => {
  const pending = new Map<number, FrameRequestCallback>();
  let nextFrameId: number;
  let now: number;

  const flushFrameAt = (ms: number) => {
    now = ms;
    const entry = [...pending.entries()].pop();
    if (!entry) throw new Error("no animation frame queued");
    pending.delete(entry[0]);
    entry[1](ms);
  };

  beforeEach(() => {
    pending.clear();
    nextFrameId = 0;
    now = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = ++nextFrameId;
      pending.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      pending.delete(id);
    });
    vi.stubGlobal("performance", { now: () => now });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("zooms in by a proportional step, ending on the exact target", () => {
    const { actions, requestZoom } = makeActions(1);
    actions.zoomActions.zoomIn();
    expect(requestZoom).not.toHaveBeenCalled();
    flushFrameAt(80);
    // Mid-animation the level is between start and target.
    expect(requestZoom).toHaveBeenLastCalledWith(1.21875);
    flushFrameAt(160);
    expect(requestZoom).toHaveBeenLastCalledWith(1.25);
    expect(pending.size).toBe(0);
  });

  it("zooms out by the same factor", () => {
    const { actions, requestZoom } = makeActions(2);
    actions.zoomActions.zoomOut();
    flushFrameAt(999);
    expect(requestZoom).toHaveBeenLastCalledWith(1.6);
  });

  it("retargets from the in-flight value so rapid clicks compound", () => {
    const { actions, requestZoom } = makeActions(1);
    actions.zoomActions.zoomIn();
    flushFrameAt(80); // ~1.21875, next frame queued
    actions.zoomActions.zoomIn(); // cancels it, retargets from ~1.21875
    flushFrameAt(240);
    expect(requestZoom).toHaveBeenLastCalledWith(1.5234375);
  });

  it("clamps to the gesture range instead of overshooting", () => {
    const { actions, requestZoom } = makeActions(4.5);
    actions.zoomActions.zoomIn();
    flushFrameAt(999);
    expect(requestZoom).toHaveBeenLastCalledWith(5);
  });

  it("jumps instantly when the user prefers reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () => ({ matches: true }),
    });
    const { actions, requestZoom } = makeActions(1);
    actions.zoomActions.zoomIn();
    expect(requestZoom).toHaveBeenCalledWith(1.25);
    expect(pending.size).toBe(0);
  });

  it("no-ops without a zoom api", () => {
    const actions = createViewerActions({
      registry: { current: {} } as never,
      getScrollState: () => ({}) as ScrollState,
      getZoomState: () => ({ currentZoom: 1, zoomPercent: 100 }),
      triggerImmediateZoomUpdate: vi.fn(),
    });
    actions.zoomActions.zoomIn();
    expect(pending.size).toBe(0);
  });
});
