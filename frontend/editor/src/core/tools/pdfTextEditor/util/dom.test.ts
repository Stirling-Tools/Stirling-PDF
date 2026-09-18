import { afterEach, describe, expect, it, vi } from "vitest";
import { yieldToBrowser } from "@app/tools/pdfTextEditor/util/dom";

describe("yieldToBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves through the MessageChannel fallback", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");
    try {
      await expect(yieldToBrowser()).resolves.toBeUndefined();
      // MessageChannel path must not touch the 4ms timer.
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });

  it("prefers scheduler.yield when the browser offers it", async () => {
    const yielded = vi.fn(async () => {});
    vi.stubGlobal("scheduler", { yield: yielded });
    await yieldToBrowser();
    expect(yielded).toHaveBeenCalledTimes(1);
  });

  it("falls back to a timer when MessageChannel is absent", async () => {
    vi.stubGlobal("MessageChannel", undefined);
    await expect(yieldToBrowser()).resolves.toBeUndefined();
  });
});
