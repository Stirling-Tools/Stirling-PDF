import { describe, it, expect, vi, afterEach } from "vitest";
import { withViewTransition } from "@editor/utils/viewTransition";

// The stub carries only the field the helper reads, hence the cast through unknown.
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
  vi.restoreAllMocks();
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

  it("skips the transition in WebKitGTK, where it crashes the app", async () => {
    const start = stubApi();
    stubReducedMotion(false);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15",
    );
    const update = vi.fn();

    await withViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps the transition in Chromium on Linux", async () => {
    const start = stubApi();
    stubReducedMotion(false);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    );
    const update = vi.fn();

    await withViewTransition(update);

    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("still applies the update where the API is unavailable", async () => {
    stubReducedMotion(false);
    const update = vi.fn();

    await withViewTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
