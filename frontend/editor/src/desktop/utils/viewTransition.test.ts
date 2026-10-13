import { describe, it, expect, vi, afterEach } from "vitest";
import { withViewTransition } from "@app/utils/viewTransition";

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

let userAgentSpy: { mockRestore: () => void } | null = null;

function stubUserAgent(userAgent: string): void {
  userAgentSpy = vi
    .spyOn(navigator, "userAgent", "get")
    .mockReturnValue(userAgent);
}

afterEach(() => {
  delete doc.startViewTransition;
  userAgentSpy?.mockRestore();
});

describe("desktop withViewTransition", () => {
  it("skips the View Transition on WebKitGTK but still applies the update", async () => {
    stubUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    );
    const start = stubApi();
    const update = vi.fn();

    await withViewTransition(update);

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps the View Transition on other desktop platforms", async () => {
    stubUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    );
    const start = stubApi();
    const update = vi.fn();

    await withViewTransition(update);

    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
