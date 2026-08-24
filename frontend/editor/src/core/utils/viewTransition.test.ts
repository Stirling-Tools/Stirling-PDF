import { describe, it, expect, vi, afterEach } from "vitest";
import { withViewTransition } from "@app/utils/viewTransition";

// The DOM lib types startViewTransition as required and fully-shaped; the stub
// only needs the one field the helper reads, so go through unknown.
type MutableDoc = { startViewTransition?: unknown };
const doc = document as unknown as MutableDoc;

function stubApi(): ReturnType<typeof vi.fn> {
  const start = vi.fn((cb: () => void) => {
    cb();
    return { finished: Promise.resolve() };
  });
  doc.startViewTransition = start;
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
  delete doc.startViewTransition;
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

  it("still applies the update where the API is unavailable", async () => {
    stubReducedMotion(false);
    const update = vi.fn();

    await withViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
