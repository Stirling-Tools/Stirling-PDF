/**
 * Unit tests for fetchWithReadyRetry.
 *
 * Regression coverage for issue #6813: bookmarks/attachments were silently
 * shown as empty after switching files via the file sidebar. The root cause
 * was that the viewer bridge returns `null` while the document is still
 * transitioning, and the sidebars treated that `null` as "loaded, but empty",
 * caching an empty success that hid the document's real data until a reload.
 */

import { describe, test, expect, vi } from "vitest";
import { fetchWithReadyRetry } from "@app/components/viewer/fetchWithReadyRetry";

// Retries with 0ms delay so tests don't wait on real timers.
const NO_DELAY = { delayMs: 0 };

describe("fetchWithReadyRetry", () => {
  test("returns the resolved array without retrying when ready", async () => {
    const fetch = vi.fn().mockResolvedValue([1, 2, 3]);

    const result = await fetchWithReadyRetry(fetch, NO_DELAY);

    expect(result).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("treats an empty array as a genuine success (document open, no items)", async () => {
    const fetch = vi.fn().mockResolvedValue([]);

    const result = await fetchWithReadyRetry(fetch, NO_DELAY);

    expect(result).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("retries on null (bridge not ready) then returns real data", async () => {
    // null, null = bridge still transitioning; then the real bookmarks arrive.
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(["bookmark"]);

    const result = await fetchWithReadyRetry(fetch, NO_DELAY);

    expect(result).toEqual(["bookmark"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("throws (does NOT return empty) when the bridge never becomes ready", async () => {
    const fetch = vi.fn().mockResolvedValue(null);

    await expect(
      fetchWithReadyRetry(fetch, { ...NO_DELAY, maxAttempts: 4 }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("retries on a 'document not open' error then succeeds", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Document is not open yet"))
      .mockResolvedValue(["bookmark"]);

    const result = await fetchWithReadyRetry(fetch, NO_DELAY);

    expect(result).toEqual(["bookmark"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("rethrows non-transient errors immediately without retrying", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(fetchWithReadyRetry(fetch, NO_DELAY)).rejects.toThrow("boom");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
