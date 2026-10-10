import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const viewport = { current: null as HTMLDivElement | null };
  const zoom = { currentZoomLevel: 1 };
  return { viewport, zoom };
});

vi.mock("@embedpdf/plugin-viewport/react", () => ({
  useViewportElement: () => mocks.viewport,
}));

vi.mock("@embedpdf/plugin-zoom/react", () => ({
  useZoom: () => ({
    provides: {
      getState: () => ({ currentZoomLevel: mocks.zoom.currentZoomLevel }),
    },
  }),
}));

import { useWheelDeltaNormalizer } from "@app/hooks/useWheelDeltaNormalizer";

function makeViewport(): HTMLDivElement {
  const host = document.createElement("div");
  const viewport = document.createElement("div");
  host.appendChild(viewport);
  Object.defineProperty(viewport, "clientHeight", { value: 600 });
  document.body.appendChild(host);
  return viewport;
}

function wheel(target: HTMLElement, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  mocks.viewport.current = null;
  mocks.zoom.currentZoomLevel = 1;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useWheelDeltaNormalizer", () => {
  it("clamps a mouse-notch ctrl+wheel delta to trackpad-sized pixels", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -100,
      deltaMode: 0,
    });

    expect(event.deltaY).toBe(-16);
    expect(event.deltaMode).toBe(0);
  });

  it("leaves a trackpad-sized delta untouched", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -4,
      deltaMode: 0,
    });

    expect(event.deltaY).toBe(-4);
  });

  it("converts line-mode deltas to pixels", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -3,
      deltaMode: 1,
    });

    expect(event.deltaY).toBe(-16);
    expect(event.deltaMode).toBe(0);
  });

  it("converts page-mode deltas to pixels", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const event = wheel(mocks.viewport.current, {
      metaKey: true,
      deltaY: -1,
      deltaMode: 2,
    });

    expect(event.deltaY).toBe(-16);
    expect(event.deltaMode).toBe(0);
  });

  it("ignores plain wheel scrolls without ctrl or meta", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const event = wheel(mocks.viewport.current, { deltaY: -100 });

    expect(event.deltaY).toBe(-100);
  });

  it("ignores wheel events outside the viewport", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const event = wheel(document.body, {
      ctrlKey: true,
      deltaY: -100,
    });

    expect(event.deltaY).toBe(-100);
  });

  it("detaches its listener on unmount", () => {
    mocks.viewport.current = makeViewport();
    const { unmount } = renderHook(() => useWheelDeltaNormalizer("doc"));
    unmount();

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -100,
    });

    expect(event.deltaY).toBe(-100);
  });

  it("stops advancing the preview once it would pass the maximum zoom", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const events = Array.from({ length: 12 }, () =>
      wheel(mocks.viewport.current!, {
        ctrlKey: true,
        deltaY: -16,
        deltaMode: 0,
      }),
    );

    expect(events[0].deltaY).toBe(-16);
    // base 1 x accumulated factor would reach 5 after ~11 notches; the excess
    // is trimmed so the commit cannot snap back from past maxZoom.
    expect(events[11].deltaY).toBe(0);
  });

  it("stops advancing the preview once it would pass the minimum zoom", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const events = Array.from({ length: 11 }, () =>
      wheel(mocks.viewport.current!, {
        ctrlKey: true,
        deltaY: 16,
        deltaMode: 0,
      }),
    );

    // base 1 / 0.84^k reaches 0.2 after ~10 notches; the last notch lands on
    // the bound (reduced), and the one past it is flattened to 0.
    expect(events[9].deltaY).toBeLessThan(16);
    expect(events[10].deltaY).toBe(0);
  });

  it("reseeds the launch scale after the gesture goes idle", () => {
    let fakeNow = 0;
    vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer("doc"));

    const first = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -16,
      deltaMode: 0,
    });
    expect(first.deltaY).toBe(-16);

    // Already at maxZoom, and past the 150ms commit window, so the next notch
    // starts a fresh gesture whose ceiling leaves no room to zoom in.
    fakeNow = 1000;
    mocks.zoom.currentZoomLevel = 5;
    const second = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -16,
      deltaMode: 0,
    });

    expect(second.deltaY).toBe(0);
  });
});
