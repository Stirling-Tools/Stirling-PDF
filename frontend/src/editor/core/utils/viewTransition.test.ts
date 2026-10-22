import { describe, it, expect, vi, afterEach } from "vitest";
import { withViewTransition } from "@app/utils/viewTransition";

function setStartViewTransition(value: unknown): void {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value,
  });
}

function stubApi(): ReturnType<typeof vi.fn> {
  const start = vi.fn((cb: () => void) => {
    cb();
    return { finished: Promise.resolve() };
  });
  setStartViewTransition(start);
  return start;
}

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  delete document.documentElement.dataset.viewTransition;
  vi.unstubAllGlobals();
});

describe("withViewTransition", () => {
  it("runs the update inside a transition when one is possible", async () => {
    const start = stubApi();
    stubReducedMotion(false);
    const update = vi.fn();

    await withViewTransition(update);

    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("skips the transition when the user asked for less motion", async () => {
    // The state change must still happen - only the animation is dropped.
    const start = stubApi();
    stubReducedMotion(true);
    const update = vi.fn();

    await withViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("marks the document for the transition's lifetime", async () => {
    let finish!: () => void;
    const start = vi.fn((cb: () => void) => {
      cb();
      return {
        finished: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      };
    });
    setStartViewTransition(start);
    stubReducedMotion(false);

    const running = withViewTransition(() => {});
    expect(document.documentElement.dataset.viewTransition).toBe("running");

    finish();
    await running;
    expect(document.documentElement.dataset.viewTransition).toBeUndefined();
  });

  it("leaves no marker when the transition is skipped", async () => {
    stubApi();
    stubReducedMotion(true);

    await withViewTransition(() => {});

    expect(document.documentElement.dataset.viewTransition).toBeUndefined();
  });

  it("keeps the marker until the last overlapping transition settles", async () => {
    const finishes: Array<() => void> = [];
    setStartViewTransition(
      vi.fn((cb: () => void) => {
        cb();
        return {
          finished: new Promise<void>((resolve) => {
            finishes.push(resolve);
          }),
        };
      }),
    );
    stubReducedMotion(false);

    const first = withViewTransition(() => {});
    const second = withViewTransition(() => {});
    expect(document.documentElement.dataset.viewTransition).toBe("running");

    finishes[0]();
    await first;
    expect(document.documentElement.dataset.viewTransition).toBe("running");

    finishes[1]();
    await second;
    expect(document.documentElement.dataset.viewTransition).toBeUndefined();
  });

  it("clears the marker when the transition cannot start", () => {
    setStartViewTransition(
      vi.fn(() => {
        throw new Error("transition unavailable");
      }),
    );
    stubReducedMotion(false);

    expect(() => withViewTransition(() => {})).toThrow(
      "transition unavailable",
    );
    expect(document.documentElement.dataset.viewTransition).toBeUndefined();
  });

  it("still applies the update where the API is unavailable", async () => {
    stubReducedMotion(false);
    const update = vi.fn();

    await withViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
