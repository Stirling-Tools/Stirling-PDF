import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const viewport = { current: null as HTMLDivElement | null };
  return { viewport };
});

vi.mock("@embedpdf/plugin-viewport/react", () => ({
  useViewportElement: () => mocks.viewport,
}));

import { useWheelDeltaNormalizer } from "@app/hooks/useWheelDeltaNormalizer";

// Mirrors the real DOM: the hook listens on the viewport's parent so its capture
// handler runs before the library's listener on the viewport.
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
  document.body.innerHTML = "";
});

describe("useWheelDeltaNormalizer", () => {
  it("clamps an oversized Ctrl + wheel notch to a single notch", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer());

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -100,
    });

    expect(event.deltaY).toBe(-16);
    expect(event.deltaMode).toBe(0);
  });

  it("leaves trackpad-sized deltas untouched", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer());

    const event = wheel(mocks.viewport.current, { ctrlKey: true, deltaY: -4 });

    expect(event.deltaY).toBe(-4);
  });

  it("normalizes line-mode deltas into pixels", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer());

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -3,
      deltaMode: 1,
    });

    expect(event.deltaY).toBe(-16);
    expect(event.deltaMode).toBe(0);
  });

  it("normalizes page-mode deltas using the viewport height", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer());

    const event = wheel(mocks.viewport.current, {
      metaKey: true,
      deltaY: -1,
      deltaMode: 2,
    });

    expect(event.deltaY).toBe(-16);
    expect(event.deltaMode).toBe(0);
  });

  it("ignores wheel without a ctrl/meta modifier", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer());

    const event = wheel(mocks.viewport.current, { deltaY: -100 });

    expect(event.deltaY).toBe(-100);
  });

  it("does not touch events raised outside the viewport subtree", () => {
    mocks.viewport.current = makeViewport();
    renderHook(() => useWheelDeltaNormalizer());

    const event = wheel(document.body, { ctrlKey: true, deltaY: -100 });

    expect(event.deltaY).toBe(-100);
  });

  it("detaches the listener on unmount", () => {
    mocks.viewport.current = makeViewport();
    const { unmount } = renderHook(() => useWheelDeltaNormalizer());
    unmount();

    const event = wheel(mocks.viewport.current, {
      ctrlKey: true,
      deltaY: -100,
    });

    expect(event.deltaY).toBe(-100);
  });
});
