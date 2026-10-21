import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedHeight } from "@app/components/shared/setupCard/AnimatedHeight";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

let resize: () => void = () => {};
let contentHeight = 100;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    () => contentHeight,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
}

/** Two resizes far enough apart to count as separate changes. */
async function resizeTo(height: number) {
  contentHeight = height;
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 1000);
  await act(async () => resize());
}

describe("AnimatedHeight", () => {
  it("clips while easing to a new height", async () => {
    stubReducedMotion(false);
    const { container } = render(<AnimatedHeight>content</AnimatedHeight>);
    const box = container.firstElementChild!;
    await resizeTo(100);
    await resizeTo(300);

    expect(box.className).toContain(styles.animating);
    expect((box as HTMLElement).style.height).toBe("300px");
  });

  it("never clips under reduced motion, where no transition ends it", async () => {
    stubReducedMotion(true);
    const { container } = render(<AnimatedHeight>content</AnimatedHeight>);
    const box = container.firstElementChild!;
    await resizeTo(100);
    await resizeTo(300);

    expect(box.className).not.toContain(styles.animating);
    expect((box as HTMLElement).style.height).toBe("300px");
  });
});
