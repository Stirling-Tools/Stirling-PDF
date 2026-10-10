import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const requestZoom = vi.fn();
  const scope = {
    getState: vi.fn(() => ({ currentZoomLevel: 1 })),
    requestZoom,
  };
  const viewport = { current: null as HTMLDivElement | null };
  return { requestZoom, scope, viewport };
});

vi.mock("@embedpdf/plugin-zoom/react", () => ({
  useZoom: () => ({ provides: mocks.scope }),
}));

vi.mock("@embedpdf/plugin-viewport/react", () => ({
  useViewportElement: () => mocks.viewport,
}));

import { useFocalWheelZoom } from "@app/hooks/useFocalWheelZoom";

function makeViewport(): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    left: 100,
    top: 50,
    width: 800,
    height: 600,
    right: 900,
    bottom: 650,
    x: 100,
    y: 50,
    toJSON: () => ({}),
  });
  Object.defineProperty(el, "clientHeight", { value: 600 });
  document.body.appendChild(el);
  return el;
}

function wheel(el: HTMLElement, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.scope.getState.mockReturnValue({ currentZoomLevel: 1 });
  mocks.viewport.current = null;
  document.body.innerHTML = "";
});

describe("useFocalWheelZoom", () => {
  it("zooms toward the cursor on Ctrl + wheel", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -100,
      clientX: 300,
      clientY: 250,
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.requestZoom).toHaveBeenCalledTimes(1);
    const [level, center] = mocks.requestZoom.mock.calls[0];
    expect(level).toBeCloseTo(Math.exp(0.15), 5);
    expect(center).toEqual({ vx: 200, vy: 200 });
  });

  it("zooms out toward the cursor on Ctrl + wheel down", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: 100,
      clientX: 300,
      clientY: 250,
    });

    const [level, center] = mocks.requestZoom.mock.calls[0];
    expect(level).toBeCloseTo(Math.exp(-0.15), 5);
    expect(center).toEqual({ vx: 200, vy: 200 });
  });

  it("ignores wheel without a ctrl/meta modifier", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    const event = wheel(mocks.viewport.current, { deltaY: -100 });

    expect(event.defaultPrevented).toBe(false);
    expect(mocks.requestZoom).not.toHaveBeenCalled();
  });

  it("scales from the current zoom level", () => {
    mocks.scope.getState.mockReturnValue({ currentZoomLevel: 2 });
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    wheel(mocks.viewport.current, { ctrlKey: true, deltaY: -100 });

    expect(mocks.requestZoom.mock.calls[0][0]).toBeCloseTo(
      2 * Math.exp(0.15),
      5,
    );
  });

  it("normalizes line-mode deltas", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -3,
      deltaMode: 1,
    });

    expect(mocks.requestZoom.mock.calls[0][0]).toBeCloseTo(Math.exp(0.072), 5);
  });

  it("clamps to the configured zoom bounds", () => {
    mocks.scope.getState.mockReturnValue({ currentZoomLevel: 4.5 });
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    wheel(mocks.viewport.current, { ctrlKey: true, deltaY: -600 });

    expect(mocks.requestZoom.mock.calls[0][0]).toBe(5);
  });

  it("does not scale below the minimum zoom", () => {
    mocks.scope.getState.mockReturnValue({ currentZoomLevel: 0.21 });
    mocks.viewport.current = makeViewport();
    renderHook(() => useFocalWheelZoom("doc"));

    wheel(mocks.viewport.current, { ctrlKey: true, deltaY: 600 });

    expect(mocks.requestZoom.mock.calls[0][0]).toBe(0.2);
  });

  it("detaches the listener on unmount", () => {
    mocks.viewport.current = makeViewport();
    const { unmount } = renderHook(() => useFocalWheelZoom("doc"));
    unmount();

    wheel(mocks.viewport.current, { ctrlKey: true, deltaY: -100 });

    expect(mocks.requestZoom).not.toHaveBeenCalled();
  });
});
