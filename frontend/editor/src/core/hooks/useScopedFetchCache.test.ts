import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useScopedFetchCache } from "@app/hooks/useScopedFetchCache";

const TTL = 30_000;

describe("useScopedFetchCache", () => {
  it("exposes fetched values and clears loading", async () => {
    const fetcher = vi.fn(async (key: string) => `value-${key}`);
    const { result, rerender } = renderHook(
      ({ keys }: { keys: readonly string[] }) =>
        useScopedFetchCache(keys, fetcher, TTL),
      { initialProps: { keys: ["a", "b"] as readonly string[] } },
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values).toEqual({ a: "value-a", b: "value-b" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Fresh keys within the TTL are served from cache, not refetched.
    rerender({ keys: ["a", "b"] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stamps failed keys so they are not retried within the TTL", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const fetcher = vi.fn(async () => {
      throw new Error("source unavailable");
    });
    const { result, rerender } = renderHook(
      ({ keys }: { keys: readonly string[] }) =>
        useScopedFetchCache(keys, fetcher, TTL),
      { initialProps: { keys: ["a"] as readonly string[] } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values).toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Re-requesting the failed key (a keystroke re-render) must not refire.
    rerender({ keys: ["a"] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it("keeps successes when a sibling key fails", async () => {
    const fetcher = vi.fn(async (key: string) => {
      if (key === "bad") throw new Error("nope");
      return `value-${key}`;
    });
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { result } = renderHook(() =>
      useScopedFetchCache(["good", "bad"], fetcher, TTL),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.values).toEqual({ good: "value-good" });
    debug.mockRestore();
  });
});
