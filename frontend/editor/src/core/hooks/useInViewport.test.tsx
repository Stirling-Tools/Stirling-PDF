import { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInViewport } from "@app/hooks/useInViewport";

function entry(
  target: Element,
  isIntersecting: boolean,
): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return {
    boundingClientRect: rect,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: rect,
    isIntersecting,
    rootBounds: null,
    target,
    time: performance.now(),
  };
}

class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin = "0px";
  readonly thresholds: readonly number[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "0px";
    FakeIntersectionObserver.instances.push(this);
  }

  emit(target: Element, isIntersecting: boolean) {
    this.callback([entry(target, isIntersecting)], this);
  }
}

function Probe({ rootMargin }: { rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inViewport = useInViewport(ref, rootMargin);
  return <div ref={ref} data-testid="target" data-in-view={inViewport} />;
}

describe("useInViewport", () => {
  afterEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.unstubAllGlobals();
  });

  it("flips true once the element intersects, then stops observing", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    render(<Probe />);

    expect(screen.getByTestId("target").dataset.inView).toBe("false");
    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.observe).toHaveBeenCalledTimes(1);

    act(() => observer.emit(screen.getByTestId("target"), false));
    expect(screen.getByTestId("target").dataset.inView).toBe("false");

    act(() => observer.emit(screen.getByTestId("target"), true));
    expect(screen.getByTestId("target").dataset.inView).toBe("true");
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("passes the caller's rootMargin to the observer", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const { unmount } = render(<Probe rootMargin="120px" />);
    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.rootMargin).toBe("120px");
    expect(observer.observe).toHaveBeenCalledWith(screen.getByTestId("target"));
    unmount();
  });

  it("observes through the nearest scroll container", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    render(
      <div data-testid="scroller" style={{ overflowY: "auto" }}>
        <Probe />
      </div>,
    );

    const observer = FakeIntersectionObserver.instances[0];
    expect(observer.root).toBe(screen.getByTestId("scroller"));
  });

  it("fails open when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Probe />);
    expect(screen.getByTestId("target").dataset.inView).toBe("true");
  });
});
