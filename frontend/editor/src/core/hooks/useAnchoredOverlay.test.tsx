import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useRef } from "react";
import { useAnchoredOverlay } from "@app/hooks/useAnchoredOverlay";

/** Drives requestAnimationFrame by hand so a queued frame can be inspected. */
function installFrameControl() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const raf = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    });
  const cancel = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id: number) => {
      frames.delete(id);
    });
  return {
    pending: () => frames.size,
    flush: () => {
      const entries = [...frames.entries()];
      frames.clear();
      act(() => {
        for (const [, cb] of entries) cb(0);
      });
    },
    restore: () => {
      raf.mockRestore();
      cancel.mockRestore();
    },
  };
}

function Harness({
  enabled,
  onPosition,
}: {
  enabled: boolean;
  onPosition?: (pos: { top: number; left: number }) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const { overlayRef, mounted } = useAnchoredOverlay({
    anchorRef,
    enabled,
    onPosition,
  });
  return (
    <>
      <div ref={anchorRef} data-anchor />
      {mounted && <div ref={overlayRef} data-overlay />}
    </>
  );
}

let anchorRect: DOMRect;

function moveAnchor(bottom: number, left: number) {
  anchorRect = {
    top: bottom - 40,
    bottom,
    left,
    right: left + 60,
    width: 60,
    height: 40,
    x: left,
    y: bottom - 40,
    toJSON: () => ({}),
  };
}

/**
 * Stubbed on the prototype, not per element: the first measurement runs during
 * mount, before a test could reach the anchor node to spy on it.
 */
function stubGeometry() {
  moveAnchor(140, 200);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => anchorRect,
  );
}

describe("useAnchoredOverlay", () => {
  let frames: ReturnType<typeof installFrameControl>;

  beforeEach(() => {
    frames = installFrameControl();
    stubGeometry();
  });

  afterEach(() => {
    frames.restore();
    vi.restoreAllMocks();
  });

  it("positions under the anchor when it opens", () => {
    const onPosition = vi.fn();
    const view = render(<Harness enabled onPosition={onPosition} />);
    stubGeometry();

    // The overlay mounts first; the layout effect then measures it.
    act(() => {
      view.rerender(<Harness enabled onPosition={onPosition} />);
    });

    // Centred under the anchor's bottom edge, plus the 8px offset.
    expect(onPosition).toHaveBeenCalledWith({ top: 148, left: 230 });
    expect(view.container.querySelector("[data-overlay]")).not.toBeNull();
  });

  it("coalesces a burst of scroll events into one measurement", () => {
    const onPosition = vi.fn();
    render(<Harness enabled onPosition={onPosition} />);
    onPosition.mockClear();
    moveAnchor(200, 260);

    for (let i = 0; i < 25; i++) {
      window.dispatchEvent(new Event("scroll"));
    }
    expect(frames.pending()).toBe(1);

    frames.flush();
    expect(onPosition).toHaveBeenCalledTimes(1);
  });

  // The stale-frame bug: a measurement queued while open used to run after the
  // overlay closed and write its position back.
  it("drops a queued measurement when the overlay closes", () => {
    const onPosition = vi.fn();
    const view = render(<Harness enabled onPosition={onPosition} />);
    stubGeometry();
    onPosition.mockClear();

    window.dispatchEvent(new Event("scroll"));
    expect(frames.pending()).toBe(1);

    act(() => {
      view.rerender(<Harness enabled={false} />);
    });

    expect(frames.pending()).toBe(0);
    frames.flush();
    expect(onPosition).not.toHaveBeenCalled();
    expect(view.container.querySelector("[data-overlay]")).toBeNull();
  });

  it("does not report an unchanged position twice", () => {
    const onPosition = vi.fn();
    render(<Harness enabled onPosition={onPosition} />);
    stubGeometry();
    onPosition.mockClear();

    moveAnchor(200, 260);
    window.dispatchEvent(new Event("scroll"));
    frames.flush();
    expect(onPosition).toHaveBeenCalledTimes(1);

    // Same anchor position again: nothing moved, so nothing is reported.
    window.dispatchEvent(new Event("scroll"));
    frames.flush();
    expect(onPosition).toHaveBeenCalledTimes(1);

    // A real move is reported.
    moveAnchor(260, 320);
    window.dispatchEvent(new Event("scroll"));
    frames.flush();
    expect(onPosition).toHaveBeenCalledTimes(2);
  });

  it("cancels queued work on unmount", () => {
    const view = render(<Harness enabled />);
    expect(view.container).toBeTruthy();
    stubGeometry();

    window.dispatchEvent(new Event("scroll"));
    expect(frames.pending()).toBe(1);

    act(() => {
      view.unmount();
    });
    expect(frames.pending()).toBe(0);
  });
});
