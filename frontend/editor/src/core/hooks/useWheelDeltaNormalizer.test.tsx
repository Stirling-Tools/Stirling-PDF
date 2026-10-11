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

function touchStart(target: HTMLElement, fingers: number): Event {
  const event = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: Array.from({ length: fingers }, () => ({})),
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * The library's `ZoomGestureWrapper` and the scroll container are siblings under
 * the viewport's parent, so the hook's subtree observer needs both.
 */
function makeViewportWithWrapper(): {
  viewport: HTMLDivElement;
  wrapper: HTMLDivElement;
  setLayoutWidth: (width: number) => void;
} {
  const viewport = makeViewport();
  const wrapper = document.createElement("div");
  viewport.parentElement!.prepend(wrapper);
  let width = 100;
  Object.defineProperty(wrapper, "offsetWidth", { get: () => width });
  Object.defineProperty(wrapper, "offsetHeight", { get: () => 50 });
  return {
    viewport,
    wrapper,
    setLayoutWidth: (next) => {
      width = next;
    },
  };
}

/** Controllable stand-in for the ResizeObserver `setupTests` stubs out. */
function stubResizeObserver(): { fire: () => void } {
  const observers: ResizeObserverCallback[] = [];
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observers.push(callback);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return {
    fire: () =>
      observers.forEach((callback) => callback([], {} as ResizeObserver)),
  };
}

/** Mutation observer records land at the microtask checkpoint. */
const flushMutations = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  // `restoreAllMocks` strips the setupTests no-op, so every test needs a real one.
  stubResizeObserver();
});

afterEach(() => {
  mocks.viewport.current = null;
  mocks.zoom.currentZoomLevel = 1;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
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

  it("holds the preview across the commit until the page wrapper re-lays-out", async () => {
    const resize = stubResizeObserver();
    const { viewport, wrapper, setLayoutWidth } = makeViewportWithWrapper();
    mocks.viewport.current = viewport;
    renderHook(() => useWheelDeltaNormalizer("doc"));

    wheel(viewport, { ctrlKey: true, deltaY: -16, deltaMode: 0 });
    wrapper.style.transform = "translate(-10px, -5px) scale(2)";
    await flushMutations();

    // The library's commit: requestZoomBy() is async but resetTransform() is not.
    wrapper.style.transform = "none";
    await flushMutations();

    expect(wrapper.style.transform).toBe("translate(-10px, -5px) scale(2)");

    // The committed zoom lands: the wrapper now lays out at its new size.
    setLayoutWidth(250);
    resize.fire();

    expect(wrapper.style.transform).toBe("none");
  });

  it("declines the hold once the commit has already re-laid-out the wrapper", async () => {
    const { viewport, wrapper, setLayoutWidth } = makeViewportWithWrapper();
    mocks.viewport.current = viewport;
    renderHook(() => useWheelDeltaNormalizer("doc"));

    wheel(viewport, { ctrlKey: true, deltaY: -16, deltaMode: 0 });
    wrapper.style.transform = "translate(-10px, -5px) scale(2)";
    await flushMutations();

    // React committed the zoom before the library cleared its preview, so the
    // wrapper already lays out at the new size; re-applying the preview here
    // would scale that new layout a second time.
    setLayoutWidth(250);
    wrapper.style.transform = "none";
    await flushMutations();

    expect(wrapper.style.transform).toBe("none");
  });

  it("leaves a cleared transform alone when no preview was showing", async () => {
    const { viewport, wrapper } = makeViewportWithWrapper();
    mocks.viewport.current = viewport;
    renderHook(() => useWheelDeltaNormalizer("doc"));

    wheel(viewport, { ctrlKey: true, deltaY: -16, deltaMode: 0 });
    wrapper.style.transform = "none";
    await flushMutations();

    expect(wrapper.style.transform).toBe("none");
  });

  it("releases a held preview when the commit never re-lays-out the wrapper", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { viewport, wrapper } = makeViewportWithWrapper();
    mocks.viewport.current = viewport;
    renderHook(() => useWheelDeltaNormalizer("doc"));

    wheel(viewport, { ctrlKey: true, deltaY: -16, deltaMode: 0 });
    wrapper.style.transform = "translate(0px, 0px) scale(2)";
    await vi.advanceTimersByTimeAsync(0);
    wrapper.style.transform = "none";
    await vi.advanceTimersByTimeAsync(0);

    expect(wrapper.style.transform).toBe("translate(0px, 0px) scale(2)");

    await vi.advanceTimersByTimeAsync(500);

    expect(wrapper.style.transform).toBe("none");
  });

  it("drops a held preview on unmount", async () => {
    const { viewport, wrapper } = makeViewportWithWrapper();
    mocks.viewport.current = viewport;
    const { unmount } = renderHook(() => useWheelDeltaNormalizer("doc"));

    wheel(viewport, { ctrlKey: true, deltaY: -16, deltaMode: 0 });
    wrapper.style.transform = "translate(0px, 0px) scale(2)";
    await flushMutations();
    wrapper.style.transform = "none";
    await flushMutations();

    unmount();

    expect(wrapper.style.transform).toBe("none");
  });

  it("arms the hold from a two-finger touchstart", async () => {
    const { viewport, wrapper } = makeViewportWithWrapper();
    mocks.viewport.current = viewport;
    renderHook(() => useWheelDeltaNormalizer("doc"));

    touchStart(viewport, 1);
    wrapper.style.transform = "translate(0px, 0px) scale(2)";
    await flushMutations();
    wrapper.style.transform = "none";
    await flushMutations();
    // A one-finger drag is a scroll, not a pinch: nothing to hold.
    expect(wrapper.style.transform).toBe("none");

    touchStart(viewport, 2);
    wrapper.style.transform = "translate(0px, 0px) scale(3)";
    await flushMutations();
    wrapper.style.transform = "none";
    await flushMutations();

    expect(wrapper.style.transform).toBe("translate(0px, 0px) scale(3)");
  });
});
